//
// Server-only: lookup of the most recent sync run for the status badge.
//
// Extracted from ingestion.server.ts so that file stays under the inline-edit
// size limit. This is the single source of truth for "what should the badge
// show right now".
//
// IMPORTANT: the badge should reflect "is my Clover data syncing", so we prefer
// the most recent DATA-FETCH run (kind incremental/full/auto) over backfill
// "paused" checkpoint rows (kind = "customer-backfill"), which are not a
// meaningful overall sync status.
//
// We also surface the first recorded error so the UI can show WHY a run failed
// instead of a bare red "failed" badge.
import { getSupabaseServer } from "./supabase.server";

/**
 * Pull the first human-readable error message out of a sync_runs.errors cell.
 * The column stores either a JSON array of strings or a raw string.
 */
function extractFirstError(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Filter out internal schema mismatch warnings from older runs
      const cleaned = parsed.filter(
        (e: any) => typeof e === "string" && !e.includes("finish sync_run: Could not find"),
      );
      if (cleaned.length > 0) return String(cleaned[0]);
      return null;
    }
    if (typeof parsed === "string") {
      if (parsed.includes("finish sync_run: Could not find")) return null;
      return parsed;
    }
  } catch {
    const s = String(raw);
    if (s.includes("finish sync_run: Could not find")) return null;
    return s.slice(0, 200);
  }
  return null;
}

export async function getLastSyncRun(): Promise<{
  runId: string | null;
  status: string | null;
  kind: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  ordersUpserted: number;
  customersUpserted: number;
  paymentsUpserted: number;
  productsUpserted: number;
  errorMessage: string | null;
} | null> {
  const sb = getSupabaseServer();

  // Prefer the most recent fetch/ingest run for the status badge. Backfill
  // rows (kind = "customer-backfill") write "paused"/"completed" checkpoints
  // that are not meaningful as the overall sync status.
  const { data, error } = await sb
    .from("sync_runs")
    .select("*")
    .in("kind", ["incremental", "full", "auto"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // Fall back to the absolute most recent row of any kind.
    const { data: fallback } = await sb
      .from("sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallback) return null;
    return {
      runId: fallback.id,
      status: fallback.status,
      kind: fallback.kind,
      startedAt: fallback.started_at,
      finishedAt: fallback.finished_at,
      ordersUpserted: fallback.orders_upserted ?? 0,
      customersUpserted: fallback.customers_upserted ?? 0,
      paymentsUpserted: fallback.payments_upserted ?? 0,
      productsUpserted: fallback.products_upserted ?? 0,
      errorMessage: extractFirstError(fallback.errors),
    };
  }

  return {
    runId: data.id,
    status: data.status,
    kind: data.kind,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    ordersUpserted: data.orders_upserted ?? 0,
    customersUpserted: data.customers_upserted ?? 0,
    paymentsUpserted: data.payments_upserted ?? 0,
    productsUpserted: data.products_upserted ?? 0,
    errorMessage: extractFirstError(data.errors),
  };
}
