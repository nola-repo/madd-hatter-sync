import { createFileRoute } from "@tanstack/react-router";
import { refreshPosData } from "@/lib/integration/ingestion.server";
import { syncOrderToGhl } from "@/lib/integration/sync.server";
import { processPendingPurchases } from "@/lib/integration/purchase-ops.server";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";

// -------------------------------------------------------------------------
// /api/sync — Automatic sync entry point
//
// IMPORTANT: This app runs on GHL AI Studio (Cloudflare Workers / Nitro).
// That is a SERVERLESS / EDGE runtime. There are no background threads.
// Any fire-and-forget `.catch()` pattern is KILLED the instant the response
// is sent. ALL async work MUST be awaited before returning a Response.
//
// This endpoint serves two purposes:
//
// 1. CLOVER WEBHOOKS (POST)
//    Configure this URL in Clover Dashboard → App Settings → Webhooks.
//    Clover will POST when orders are created/updated or payments clear.
//    We synchronously sync the specific order to GHL (tags + custom object).
//
// 2. CRON PING (GET)
//    Hit GET /api/sync?secret=SYNC_SECRET to trigger a full background refresh.
//    Configure cron-job.org to call this URL every 15–30 minutes.
//    The cron timeout must be >= 60 seconds (set to 120s in cron-job.org settings).
//    Returns the full sync result once complete.
// -------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync")({
    server: {
        handlers: {
            // ---- GET: triggered by cron ---------------------------------
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const secret = url.searchParams.get("secret");
                const cfg = getIntegrationConfig();

                // Validate the secret (set SYNC_SECRET in your env vars)
                const expectedSecret = process.env.SYNC_SECRET ?? cfg.clover.webhookSecret ?? "";
                if (expectedSecret && secret !== expectedSecret) {
                    return Response.json({ error: "Unauthorized" }, { status: 401 });
                }

                // MUST await — GHL AI Studio (Cloudflare Workers) kills background tasks.
                try {
                    const result = await runFullSync();
                    return Response.json({
                        ok: true,
                        message: "Full sync completed.",
                        timestamp: new Date().toISOString(),
                        ...result,
                    });
                } catch (e: any) {
                    return Response.json({
                        ok: false,
                        error: e?.message ?? "Sync failed",
                        timestamp: new Date().toISOString(),
                    }, { status: 500 });
                }
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
                    // Run a full refresh to pick up newly paid orders.
                    if (eventType === "PAYMENT" || eventType.includes("PAYMENT")) {
                        await runFullSync();
                        return Response.json({ ok: true, action: "full_sync_completed", event: eventType });
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

                        // Also run pending purchase ops (tags) — must await on serverless!
                        await processPendingPurchases(50).catch((e) =>
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
                    await runFullSync();
                    return Response.json({ ok: true, action: "fallback_full_sync", event: eventType });
                } catch (e: any) {
                    console.error("[clover-webhook] handler error:", e);
                    return Response.json({ error: e?.message ?? "Internal error" }, { status: 500 });
                }
            },
        },
    },
});

// ---- Full pipeline sync ------------------------------------------------

async function runFullSync(): Promise<{
    customersUpserted: number;
    ordersUpserted: number;
    processed: number;
    matched: number;
    tagsApplied: number;
}> {
    console.log("[auto-sync] Starting full refresh pipeline...");
    let refreshResult: any = {};
    let opsResult: any = {};
    try {
        // Step 1: Pull all data from Clover into Supabase
        refreshResult = await refreshPosData();
        console.log(
            `[auto-sync] Clover refresh done: ${refreshResult.customersUpserted} customers, ` +
            `${refreshResult.ordersUpserted} orders, ${refreshResult.orderItemsUpserted} items.`,
        );

        // Step 2: Match customers, auto-create GHL contacts, apply tags + POS Purchase Items
        opsResult = await processPendingPurchases(200);
        console.log(
            `[auto-sync] Purchase ops done: ${opsResult.processed} customers, ` +
            `${opsResult.matched} matched, ${opsResult.tagsApplied} tags applied, ` +
            `${opsResult.tagsVerified} verified.`,
        );

        return {
            customersUpserted: refreshResult.customersUpserted ?? 0,
            ordersUpserted: refreshResult.ordersUpserted ?? 0,
            processed: opsResult.processed ?? 0,
            matched: opsResult.matched ?? 0,
            tagsApplied: opsResult.tagsApplied ?? 0,
        };
    } catch (e: any) {
        console.error("[auto-sync] Full sync error:", e);

        // Write the failure to sync_runs so it's visible in the admin UI.
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
            // DB itself may be down — log and continue.
            console.error("[auto-sync] Also failed to write failure record to DB:", dbErr);
        }

        throw e;
    }
}
