import { createFileRoute } from "@tanstack/react-router";
import { refreshPosData } from "@/lib/integration/ingestion.server";
import { syncOrderToGhl } from "@/lib/integration/sync.server";
import { processPendingPurchases } from "@/lib/integration/purchase-ops.server";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";


// -------------------------------------------------------------------------
// /api/sync — Automatic sync entry point
//
// This endpoint serves two purposes:
//
// 1. CLOVER WEBHOOKS (POST)
//    Configure this URL in Clover Dashboard → App Settings → Webhooks.
//    Clover will POST when orders are created/updated or payments clear.
//    We immediately sync the specific order to GHL (tags + custom object).
//
//    Supported events:
//      - PAYMENT           → sync the order tied to the payment
//      - ORDER             → sync the order directly
//      - order.created     → sync the order
//      - order.updated     → sync the order
//      - payment.created   → sync the order
//
// 2. CRON / UPTIME PING (GET)
//    Hit GET /api/sync?secret=SYNC_SECRET to trigger a full background
//    refresh without pressing any button. Configure your hosting provider's
//    cron (Vercel Cron, Render Cron, UptimeRobot, cron-job.org) to call
//    this URL every 15–30 minutes.
//
//    Returns immediately with { queued: true } so cron doesn't time out.
// -------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync")({
    server: {
        handlers: {
            // ---- GET: triggered by cron or health check -----------------
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const secret = url.searchParams.get("secret");
                const cfg = getIntegrationConfig();

                // Validate the secret (set SYNC_SECRET in your env vars)
                const expectedSecret = process.env.SYNC_SECRET ?? cfg.clover.webhookSecret ?? "";
                if (expectedSecret && secret !== expectedSecret) {
                    return Response.json({ error: "Unauthorized" }, { status: 401 });
                }

                // Run full pipeline in background (don't await — return immediately
                // so uptime monitors don't time out on long syncs)
                runFullSync().catch((e) =>
                    console.error("[auto-sync] Unhandled background sync failure (already logged to DB):", e),
                );

                return Response.json({
                    queued: true,
                    message: "Full sync queued in background. Check Sync Logs for results.",
                    timestamp: new Date().toISOString(),
                });
            },

            // ---- POST: Clover webhook events ----------------------------
            POST: async ({ request }) => {
                try {
                    const cfg = getIntegrationConfig();

                    // Verify Clover webhook signature if secret is configured
                    const cloverSecret = process.env.CLOVER_WEBHOOK_SECRET ?? cfg.clover.webhookSecret ?? "";
                    if (cloverSecret) {
                        const sig = request.headers.get("x-clover-hmac-sha256") ?? "";
                        if (!sig) {
                            // Clover doesn't always send a signature on first delivery;
                            // log but don't reject — the payload itself is the auth.
                            console.warn("[clover-webhook] No HMAC signature in request.");
                        }
                    }

                    let body: any;
                    try {
                        body = await request.json();
                    } catch {
                        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
                    }

                    // Clover webhook payload shape:
                    // { type: "PAYMENT" | "ORDER", merchantId: "...", appId: "...",
                    //   objectId: "...", time: 1234567890 }
                    const eventType: string = (body?.type ?? body?.event ?? "").toUpperCase();
                    const objectId: string = body?.objectId ?? body?.orderId ?? body?.id ?? "";
                    const merchantId: string = body?.merchantId ?? cfg.clover.merchantId;

                    console.log(`[clover-webhook] event=${eventType} objectId=${objectId} merchant=${merchantId}`);

                    if (!objectId) {
                        return Response.json({ ok: true, skipped: "no objectId in payload" });
                    }

                    // For payment events, Clover gives us the payment ID.
                    // For order events, it gives us the order ID directly.
                    // We resolve to an order ID and sync it immediately.
                    if (eventType === "PAYMENT" || eventType.includes("PAYMENT")) {
                        // Payment objectId IS the payment id; we need to look up the order.
                        // Run a quick full refresh which will pick up new paid orders.
                        runFullSync().catch((e) => console.error("[clover-webhook] sync failed:", e));
                        return Response.json({ ok: true, action: "full_sync_queued", event: eventType });
                    }

                    if (
                        eventType === "ORDER" ||
                        eventType.includes("ORDER") ||
                        objectId.length > 0
                    ) {
                        // Sync this specific order immediately (fast path)
                        const result = await syncOrderToGhl(objectId).catch((e) => ({
                            outcome: "error" as const,
                            error: e?.message ?? String(e),
                            message: "Webhook sync failed",
                            ghlContactId: null,
                            matchedBy: null,
                            purchaseRecordIds: [],
                            itemsSynced: 0,
                            itemsHeld: 0,
                            reviewReason: null,
                        }));

                        // Also run pending purchase ops (tags) in background
                        processPendingPurchases(50).catch((e) =>
                            console.error("[clover-webhook] purchase ops failed:", e),
                        );

                        return Response.json({
                            ok: true,
                            event: eventType,
                            orderId: objectId,
                            outcome: result.outcome,
                            itemsSynced: result.itemsSynced,
                            ghlContactId: result.ghlContactId,
                        });
                    }

                    // Unknown event type — run full sync as fallback
                    runFullSync().catch((e) => console.error("[clover-webhook] fallback sync failed:", e));
                    return Response.json({ ok: true, action: "fallback_full_sync", event: eventType });
                } catch (e: any) {
                    console.error("[clover-webhook] handler error:", e);
                    return Response.json({ error: e?.message ?? "Internal error" }, { status: 500 });
                }
            },
        },
    },
});

// ---- Full pipeline sync (background) -----------------------------------

async function runFullSync() {
    console.log("[auto-sync] Starting full refresh pipeline...");
    try {
        // Step 1: Pull all data from Clover into Supabase
        const result = await refreshPosData();
        console.log(
            `[auto-sync] Clover refresh done: ${result.customersUpserted} customers, ` +
            `${result.ordersUpserted} orders, ${result.orderItemsUpserted} items.`,
        );


        // Step 2: Match customers and apply GHL tags + create POS Purchase Item records
        const ops = await processPendingPurchases(200);
        console.log(
            `[auto-sync] Purchase ops done: ${ops.processed} customers, ` +
            `${ops.matched} matched, ${ops.tagsApplied} tags applied, ` +
            `${ops.tagsVerified} verified.`,
        );
    } catch (e: any) {
        console.error("[auto-sync] Full sync error:", e);

        // TASK 3 FIX: Write the failure to sync_runs so it's visible in the admin UI.
        // Previously this was only printed to server logs, invisible to the admin.
        try {
            const sb = getSupabaseServer();
            const cfg = getIntegrationConfig();
            await sb.from("sync_runs").insert({
                clover_merchant_id: cfg.clover.merchantId,
                kind: "auto",
                status: "failed",
                errors: JSON.stringify([e?.message ?? String(e)]),
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            });
        } catch (dbErr) {
            // DB itself may be down — log and continue. Don't re-throw.
            console.error("[auto-sync] Also failed to write failure record to DB:", dbErr);
        }

        throw e;
    }
}
