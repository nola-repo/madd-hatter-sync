import { createFileRoute } from "@tanstack/react-router";
import { refreshPosData } from "@/lib/integration/ingestion.server";
import { syncOrderToGhl } from "@/lib/integration/sync.server";
import { processPendingPurchases } from "@/lib/integration/purchase-ops.server";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";
import { sendSyncAlert } from "@/lib/integration/alert.server";

// -------------------------------------------------------------------------
// /api/sync — Sync entry point for cron-job.org and Clover webhooks
//
// IMPORTANT: GHL AI Studio runs on Cloudflare Workers (Nitro/serverless).
// There are NO background threads. All work must complete before the response.
// cron-job.org max timeout = 30 seconds, so we split the pipeline into steps:
//
//   GET /api/sync?secret=...&step=fetch  → Pull Clover data into Supabase (~5-10s)
//   GET /api/sync?secret=...&step=push   → Push pending orders to GHL (~10-20s)
//   GET /api/sync?secret=...             → Run both steps (may timeout on large datasets)
//
// RECOMMENDED CRON SETUP (cron-job.org):
//   Job A: GET /api/sync?secret=...&step=fetch  every 15 min
//   Job B: GET /api/sync?secret=...&step=push   every 15 min  (offset by 2 minutes)
//
// CLOVER WEBHOOK (POST):
//   Configure webhook URL in Clover Dashboard → App Settings → Webhooks.
//   Set CLOVER_WEBHOOK_SECRET to the secret configured in the Clover dashboard
//   for HMAC-SHA256 signature verification.
// -------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync")({
    server: {
        handlers: {
            // ---- GET: triggered by cron ---------------------------------
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const secret = url.searchParams.get("secret");
                const step = url.searchParams.get("step"); // "fetch" | "push" | null (both)

                const batchLimit = Math.min(
                    50,
                    Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10) || 10),
                );

                const cfg = getIntegrationConfig();

                // FIX #21: Use properly typed cfg.clover.webhookSecret (was cfg.clover.webhookSecret
                // which didn't exist on the type — now it does, and SYNC_SECRET still takes priority).
                const expectedSecret = process.env.SYNC_SECRET ?? cfg.clover.webhookSecret ?? "";
                if (expectedSecret && secret !== expectedSecret) {
                    return Response.json({ error: "Unauthorized" }, { status: 401 });
                }

                try {
                    if (step === "fetch") {
                        // Step A only: pull Clover → Supabase (fast, ~5-10s)
                        const result = await stepFetch();
                        return Response.json({ ok: true, step: "fetch", ...result });
                    }

                    if (step === "push") {
                        // Step B only: Supabase → GHL contacts + Purchase Items (fast with small limit)
                        const result = await stepPush(batchLimit);
                        return Response.json({ ok: true, step: "push", ...result });
                    }

                    // No step specified: run both (may be slow, only use for manual testing)
                    const fetchResult = await stepFetch();
                    const pushResult = await stepPush(batchLimit);
                    return Response.json({
                        ok: true,
                        step: "both",
                        timestamp: new Date().toISOString(),
                        ...fetchResult,
                        ...pushResult,
                    });
                } catch (e: any) {
                    await logFailure(e);
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

                    // FIX #9: Read the raw body FIRST (before .json()) so we can verify the HMAC.
                    const rawBody = await request.text();

                    // FIX #9: Validate the Clover HMAC-SHA256 webhook signature if a secret is
                    // configured. Previously the signature was read but NEVER verified — any caller
                    // could POST arbitrary order IDs and trigger GHL sync operations.
                    const cloverSecret = cfg.clover.webhookSecret ?? "";
                    if (cloverSecret) {
                        const sig = request.headers.get("x-clover-hmac-sha256") ?? "";
                        if (!sig) {
                            console.warn("[clover-webhook] Request missing HMAC signature — rejecting.");
                            return Response.json({ error: "Missing webhook signature" }, { status: 401 });
                        }
                        const valid = await verifyCloverWebhookSignature(cloverSecret, rawBody, sig);
                        if (!valid) {
                            console.warn("[clover-webhook] Invalid HMAC signature — rejecting.");
                            return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
                        }
                    } else {
                        console.warn(
                            "[clover-webhook] CLOVER_WEBHOOK_SECRET not set \u2014 skipping signature verification. " +
                            "Set it in your environment secrets for production security.",
                        );
                    }

                    let body: any;
                    try {
                        body = JSON.parse(rawBody);
                    } catch {
                        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
                    }

                    const eventType: string = (body?.type ?? body?.event ?? "").toUpperCase();
                    const objectId: string = body?.objectId ?? body?.orderId ?? body?.id ?? "";
                    const merchantId: string = body?.merchantId ?? cfg.clover.merchantId;

                    console.log(`[clover-webhook] event=${eventType} objectId=${objectId} merchant=${merchantId}`);

                    if (!objectId) {
                        return Response.json({ ok: true, skipped: "no objectId in payload" });
                    }

                    // For payment events: run a quick Clover fetch to pick up new paid orders
                    if (eventType === "PAYMENT" || eventType.startsWith("PAYMENT")) {
                        await stepFetch();
                        // Push a small batch immediately
                        await stepPush(10);
                        return Response.json({ ok: true, action: "fetch_and_push", event: eventType });
                    }

                    // FIX #10: Only handle ORDER events in the order-sync branch.
                    // Previously `|| objectId.length > 0` caused ALL webhook events (PAYMENT,
                    // CUSTOMER, INVENTORY etc.) to route here, calling syncOrderToGhl with
                    // non-order IDs and generating confusing 404 errors in the logs.
                    if (eventType === "ORDER" || eventType.startsWith("ORDER_")) {
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

                        // Run a small tag pass immediately
                        await processPendingPurchases(10).catch((e) =>
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

                    // Unknown / unhandled event type: run a small fetch+push to stay current.
                    console.log(`[clover-webhook] Unhandled event type "${eventType}" \u2014 running small fetch+push.`);
                    await stepFetch();
                    await stepPush(10);
                    return Response.json({ ok: true, action: "fallback_sync", event: eventType });
                } catch (e: any) {
                    console.error("[clover-webhook] handler error:", e);
                    return Response.json({ error: e?.message ?? "Internal error" }, { status: 500 });
                }
            },
        },
    },
});

// ---- Step A: Pull Clover data into Supabase (fast) ----------------------

async function stepFetch() {
    console.log("[sync] stepFetch: pulling Clover data...");
    const result = await refreshPosData();
    console.log(`[sync] stepFetch done: ${result.customersUpserted} customers, ${result.ordersUpserted} orders`);
    return {
        customersUpserted: result.customersUpserted ?? 0,
        ordersUpserted: result.ordersUpserted ?? 0,
        itemsUpserted: result.orderItemsUpserted ?? 0,
    };
}

// ---- Step B: Push pending orders to GHL (small batch, fast) -------------

async function stepPush(limit = 25) {
    console.log(`[sync] stepPush: processing up to ${limit} customers...`);
    const ops = await processPendingPurchases(limit);
    console.log(
        `[sync] stepPush done: ${ops.processed} processed, ${ops.matched} matched, ` +
        `${ops.tagsApplied} tags applied.`,
    );
    return {
        processed: ops.processed ?? 0,
        matched: ops.matched ?? 0,
        tagsApplied: ops.tagsApplied ?? 0,
        tagsVerified: ops.tagsVerified ?? 0,
        errors: ops.errors ?? 0,
    };
}

// ---- Failure logging to Supabase ----------------------------------------

async function logFailure(e: any) {
    await sendSyncAlert({
        level: "error",
        title: "Madd Hatter Sync Failed",
        detail: e?.message ?? String(e),
        context: { timestamp: new Date().toISOString() },
    });
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
        console.error("[sync] Failed to write failure record to DB:", dbErr);
    }
}

// ---- FIX #9: HMAC-SHA256 signature verification -------------------------

/**
 * Verify a Clover webhook HMAC-SHA256 signature using the Web Crypto API.
 * Compatible with both Node.js (>=18) and Cloudflare Workers edge runtimes.
 *
 * Clover signs the raw request body with the webhook secret using HMAC-SHA256
 * and base64-encodes the result into the x-clover-hmac-sha256 header.
 */
async function verifyCloverWebhookSignature(
    secret: string,
    rawBody: string,
    signature: string,
): Promise<boolean> {
    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const expectedBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
        const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedBuf)));
        // Timing-safe string comparison to prevent timing-oracle attacks.
        return timingSafeEqual(expectedB64, signature);
    } catch {
        return false;
    }
}

/** Constant-time string comparison to mitigate timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
