import { createFileRoute } from "@tanstack/react-router";
import { refreshPosData, runCrmSync } from "@/lib/integration/ingestion.server";
import { syncOrderToGhl } from "@/lib/integration/sync.server";
import { processPendingPurchases } from "@/lib/integration/purchase-ops.server";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";

// -------------------------------------------------------------------------
// /api/sync — Server-to-server sync entry point.
//
// This is the SOLE trigger for the Clover → Supabase → GHL pipeline. It runs
// entirely on the backend and requires NO admin browser session.
//
// GHL AI Studio runs on Cloudflare Workers (Nitro/serverless). There are NO
// background threads — all work must complete before the response returns.
// cron-job.org max timeout = 30 seconds, so the pipeline is split into steps:
//
//   GET /api/sync?secret=...&step=fetch  → Pull Clover data into Supabase (~5-10s)
//   GET /api/sync?secret=...&step=push   → Push pending orders to GHL (~10-20s)
//   GET /api/sync?secret=...             → Run both steps (manual testing only)
//
// RECOMMENDED CRON SETUP (cron-job.org / UptimeRobot / Render Cron):
//   Job A: GET /api/sync?secret=<SYNC_SECRET>&step=fetch  every 15 min
//   Job B: GET /api/sync?secret=<SYNC_SECRET>&step=push   every 15 min (offset 2 min)
//
// CLOVER WEBHOOK (POST):
//   Configure the webhook URL in the Clover Dashboard → App Settings → Webhooks.
//   The POST handler verifies the HMAC signature using CLOVER_WEBHOOK_SECRET.
//
// SECURITY:
//   - SYNC_SECRET and CLOVER_WEBHOOK_SECRET are read from process.env INSIDE
//     the handler (env is injected per-request on Cloudflare Workers).
//   - They are NEVER exposed to the client bundle.
//   - The GET handler rejects requests without a matching secret.
//   - The POST handler verifies the Clover HMAC signature when a secret is set.
// -------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      // ---- GET: triggered by external cron service ----------------
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const step = url.searchParams.get("step"); // "fetch" | "push" | null (both)

        // Validate the shared cron secret (read inside the handler).
        const expectedSecret = (process.env.SYNC_SECRET ?? "").trim();
        if (!expectedSecret) {
          console.error("[sync] SYNC_SECRET is not configured. Set it in Secrets.");
          return Response.json(
            { error: "Sync not configured (missing SYNC_SECRET)" },
            { status: 503 },
          );
        }
        if (secret !== expectedSecret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          if (step === "fetch") {
            // Step A only: pull Clover → Supabase (fast, ~5-10s)
            const result = await stepFetch();
            return Response.json({ ok: true, step: "fetch", ...result });
          }

          if (step === "push") {
            // Step B only: Supabase → GHL contacts + Purchase Items
            const result = await stepPush(25);
            return Response.json({ ok: true, step: "push", ...result });
          }

          // No step specified: run both (may be slow — manual testing only)
          const fetchResult = await stepFetch();
          const pushResult = await stepPush(25);
          return Response.json({
            ok: true,
            step: "both",
            timestamp: new Date().toISOString(),
            ...fetchResult,
            ...pushResult,
          });
        } catch (e: any) {
          await logFailure(e);
          return Response.json(
            {
              ok: false,
              error: e?.message ?? "Sync failed",
              timestamp: new Date().toISOString(),
            },
            { status: 500 },
          );
        }
      },

      // ---- POST: Clover webhook events -----------------------------
      POST: async ({ request }) => {
        try {
          const cfg = getIntegrationConfig();

          // ---- HMAC signature verification (server-side only) ----
          // Clover signs the raw request body with the webhook secret using
          // HMAC-SHA256 and sends the signature in the x-clover-hmac-sha256
          // header. We verify it with a timing-safe comparison.
          const cloverSecret = cfg.clover.webhookSecret;
          if (cloverSecret) {
            const rawBody = await request.text();
            const sig = request.headers.get("x-clover-hmac-sha256") ?? "";
            if (!sig) {
              console.warn("[clover-webhook] No HMAC signature in request — rejecting.");
              return Response.json({ error: "Missing signature" }, { status: 401 });
            }
            const verified = await verifyCloverHmac(rawBody, cloverSecret, sig);
            if (!verified) {
              console.warn("[clover-webhook] HMAC signature mismatch — rejecting.");
              return Response.json({ error: "Invalid signature" }, { status: 401 });
            }
            // Re-parse the verified body.
            let body: any;
            try {
              body = JSON.parse(rawBody);
            } catch {
              return Response.json({ error: "Invalid JSON body" }, { status: 400 });
            }
            return await handleWebhookEvent(body, cfg);
          }

          // No webhook secret configured — accept but warn (less secure).
          console.warn(
            "[clover-webhook] CLOVER_WEBHOOK_SECRET not set — accepting unverified webhook.",
          );
          let body: any;
          try {
            body = await request.json();
          } catch {
            return Response.json({ error: "Invalid JSON body" }, { status: 400 });
          }
          return await handleWebhookEvent(body, cfg);
        } catch (e: any) {
          console.error("[clover-webhook] handler error:", e);
          return Response.json({ error: e?.message ?? "Internal error" }, { status: 500 });
        }
      },
    },
  },
});

// ---- Webhook event dispatcher -------------------------------------------

async function handleWebhookEvent(body: any, cfg: ReturnType<typeof getIntegrationConfig>) {
  const eventType: string = (body?.type ?? body?.event ?? "").toUpperCase();
  const objectId: string = body?.objectId ?? body?.orderId ?? body?.id ?? "";
  const merchantId: string = body?.merchantId ?? cfg.clover.merchantId;

  console.log(`[clover-webhook] event=${eventType} objectId=${objectId} merchant=${merchantId}`);

  if (!objectId) {
    return Response.json({ ok: true, skipped: "no objectId in payload" });
  }

  // For payment events: run a quick Clover fetch to pick up new paid orders.
  if (eventType === "PAYMENT" || eventType.includes("PAYMENT")) {
    await stepFetch();
    // Push a small batch immediately.
    await stepPush(10);
    return Response.json({ ok: true, action: "fetch_and_push", event: eventType });
  }

  // For order events: sync this specific order immediately.
  if (eventType === "ORDER" || eventType.includes("ORDER") || objectId.length > 0) {
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

    // Run a small tag pass immediately.
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

  // Unknown event: run small fetch+push.
  await stepFetch();
  await stepPush(10);
  return Response.json({ ok: true, action: "fallback_sync", event: eventType });
}

// ---- HMAC verification (timing-safe) ------------------------------------

async function verifyCloverHmac(
  rawBody: string,
  secret: string,
  signature: string,
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Timing-safe comparison.
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (e) {
    console.error("[clover-webhook] HMAC verification error:", e);
    return false;
  }
}

// ---- Step A: Pull Clover data into Supabase (fast, bounded for cron) ----

async function stepFetch() {
  console.log("[sync] stepFetch: pulling Clover data...");
  // Limit to recent 7 days during periodic cron to ensure it completes
  // well within the 30s cron-job.org timeout ceiling.
  const result = await refreshPosData({ kind: "incremental", range: "week" });
  console.log(
    `[sync] stepFetch done: ${result.customersUpserted} customers, ${result.ordersUpserted} orders`,
  );
  return {
    customersUpserted: result.customersUpserted ?? 0,
    ordersUpserted: result.ordersUpserted ?? 0,
    itemsUpserted: result.orderItemsUpserted ?? 0,
    errors: result.errors,
  };
}

// ---- Step B: Push pending orders to GHL (small batch, fast) -------------

async function stepPush(limit = 25) {
  console.log(`[sync] stepPush: syncing up to ${limit} orders to CRM...`);
  const result = await runCrmSync(limit);
  console.log(
    `[sync] stepPush done: ${result.ordersSynced} synced, ${result.ordersHeld} held, ` +
      `${result.tagsApplied} tags applied, ${result.purchaseRecordsCreated} purchase records.`,
  );
  return {
    ordersProcessed: result.ordersProcessed,
    ordersSynced: result.ordersSynced,
    ordersHeld: result.ordersHeld,
    ordersErrors: result.ordersErrors,
    contactsResolved: result.contactsResolved,
    purchaseRecordsCreated: result.purchaseRecordsCreated,
    tagsApplied: result.tagsApplied,
    tagsVerified: result.tagsVerified,
    errors: result.errors.length,
  };
}

// ---- Failure logging to Supabase ----------------------------------------

async function logFailure(e: any) {
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
