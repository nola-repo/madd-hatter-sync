import { createFileRoute } from "@tanstack/react-router";
import { backfillStrandedCustomers } from "@/lib/integration/customer-backfill.server";

// -------------------------------------------------------------------------
// POST /api/sync/historical-customers
// GET  /api/sync/historical-customers?secret=...
//
// CUSTOMER-FIRST bulk backfill endpoint. This completely BYPASSES the
// transaction/order queues. It scans the `customers` table directly for
// profiles that HAVE a usable phone/email identifier but LACK a row in
// `customer_mappings`, then upserts each one into the CRM and persists the
// mapping so they are never processed twice.
//
// Why this exists:
//   The order-driven sync engine only resolves identity while scanning PAID
//   orders. ~600 stranded customers had valid identifiers but no active
//   order rows, so they were invisible and stuck at $0 / 0 orders forever.
//
// SECURITY:
//   - SYNC_SECRET (or a dedicated SYNC_BACKFILL_SECRET) is verified inside
//     the handler. Never exposed to the client bundle.
//   - No tokens leave the server.
//   - Time-boxed to ~22s so cron-job.org never hits its 30s timeout.
//
// CRON SETUP:
//   Job: GET /api/sync/historical-customers?secret=<SYNC_SECRET>&limit=100
//   every 15 min until `remaining` in the response hits 0.
// -------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync/historical-customers")({
  server: {
    handlers: {
      // Both GET (cron) and POST (manual) are supported.
      GET: async ({ request }) => handleBackfill(request),
      POST: async ({ request }) => handleBackfill(request),
    },
  },
});

async function handleBackfill(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Validate the shared cron secret (read inside the handler for CF Workers).
  const expectedSecret = (process.env.SYNC_BACKFILL_SECRET ?? process.env.SYNC_SECRET ?? "").trim();
  if (!expectedSecret) {
    console.error("[backfill] SYNC_SECRET is not configured. Set it in Secrets.");
    return Response.json(
      { error: "Backfill not configured (missing SYNC_SECRET)" },
      { status: 503 },
    );
  }

  const secret = url.searchParams.get("secret") ?? request.headers.get("x-sync-secret") ?? "";
  if (secret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional batch limit override (env SYNC_BATCH_LIMIT is the global default).
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    console.log("[backfill] starting customer-first bulk backfill...");
    const summary = await backfillStrandedCustomers(limit, 18_000);
    const ok = summary.errors.length === 0;
    return Response.json(
      {
        ok,
        ...summary,
        timestamp: new Date().toISOString(),
        instructions:
          summary.remaining > 0
            ? "Backlog remains. Re-run this endpoint (cron or manual) to continue draining it."
            : "Backlog fully drained. All eligible customers are mapped.",
      },
      { status: ok ? 200 : 207 },
    );
  } catch (e: any) {
    console.error("[backfill] fatal error:", e);
    return Response.json(
      { ok: false, error: e?.message ?? "Backfill failed", timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}
