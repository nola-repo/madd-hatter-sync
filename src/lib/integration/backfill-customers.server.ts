//
// Server-only: CUSTOMER-FIRST bulk backfill pipeline.
//
// The legacy sync engine is strictly ORDER-driven: it only resolves customer
// identity when scanning for PAID orders in a pending/error/held_for_review
// state. Customers who have valid identifiers but NO active transaction rows
// are invisible to that loop — stranded as "No CRM Match" at $0 / 0 orders.
//
// This pipeline inverts the entry point: it queries the `customers` table
// directly for profiles that have a phone or email but no row in
// `customer_mappings`, then upserts them to GHL V2 and persists the mapping.
// It is idempotent and fully decoupled from the order/transaction queues.
//
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import { normalizeEmail, normalizePhone } from "./matching.server";
import { upsertGhlContactV2 } from "./ghl-upsert.server";
import { withRateLimit, logThrottle } from "./rate-limit.server";

export type BackfillSummary = {
  scanned: number;
  processed: number;
  matched: number;
  created: number;
  conflicts: number;
  noIdentifiers: number;
  rateLimited: number;
  errors: number;
  paused: boolean;
  nextCursor: number | null;
  elapsedMs: number;
};

/**
 * Pull a page of orphaned customers (have email/phone, no mapping) directly
 * from Supabase, bypassing the order queue entirely.
 *
 * @param cursor  offset into the customer list for resumable pagination
 * @param limit   page size
 */
async function fetchOrphanedCustomers(cursor: number, limit: number) {
  const sb = getSupabaseServer();
  const cfg = getIntegrationConfig();

  // Customers with a phone OR email, not already in customer_mappings.
  // We use a left-join anti-pattern via not.exists is not supported simply,
  // so we fetch a page and filter against mappings in memory after.
  const { data, error } = await sb
    .from("customers")
    .select("clover_customer_id, first_name, last_name, email, phone")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .or("email.not.is.null,phone.not.is.null")
    .order("clover_customer_id", { ascending: true })
    .range(cursor, cursor + limit - 1);

  if (error) throw new Error(`DB orphan fetch: ${error.message}`);
  return (data ?? []) as Array<{
    clover_customer_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
}

/**
 * Run the customer-first backfill. Time-boxed to ~22s so a cron tick can
 * resume from `nextCursor` on the next invocation without re-scanning.
 *
 * @param opts.limit  page size (default 100, capped by env SYNC_BATCH_LIMIT)
 */
export async function backfillHistoricalCustomers(opts: {
  limit?: number;
  maxElapsedMs?: number;
}): Promise<BackfillSummary> {
  const cfg = getIntegrationConfig();
  const sb = getSupabaseServer();
  const startTime = Date.now();
  const maxElapsedMs = opts.maxElapsedMs ?? 22_000;
  const envLimit = process.env.SYNC_BATCH_LIMIT ? parseInt(process.env.SYNC_BATCH_LIMIT, 10) : 100;
  const limit = opts.limit ?? envLimit;

  const summary: BackfillSummary = {
    scanned: 0,
    processed: 0,
    matched: 0,
    created: 0,
    conflicts: 0,
    noIdentifiers: 0,
    rateLimited: 0,
    errors: 0,
    paused: false,
    nextCursor: null,
    elapsedMs: 0,
  };

  // Load the checkpoint of where the last run paused, if any.
  let cursor = 0;
  try {
    const { data: ck } = await sb
      .from("sync_runs")
      .select("cursor_position")
      .eq("kind", "customer_backfill")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ck?.cursor_position && typeof ck.cursor_position === "number") {
      cursor = ck.cursor_position;
    }
  } catch {
    /* ignore — start from 0 */
  }

  // Open a backfill run record for observability.
  const { data: runRow } = await sb
    .from("sync_runs")
    .insert({
      kind: "customer_backfill",
      status: "in_progress",
      started_at: new Date().toISOString(),
      cursor_position: cursor,
    })
    .select("id")
    .maybeSingle();
  const runId = runRow?.id;

  while (Date.now() - startTime < maxElapsedMs) {
    if (summary.processed >= limit) break;

    const page = await fetchOrphanedCustomers(cursor, Math.min(limit, 100));
    if (page.length === 0) {
      // Reached the end of the customer list — reset checkpoint for next run.
      cursor = 0;
      break;
    }

    // Filter out customers that already have a mapping (idempotency guard).
    const ids = page.map((c) => c.clover_customer_id);
    const { data: existingMaps } = await sb
      .from("customer_mappings")
      .select("clover_customer_id")
      .in("clover_customer_id", ids);
    const mappedIds = new Set((existingMaps ?? []).map((m) => m.clover_customer_id));

    for (const cust of page) {
      if (Date.now() - startTime > maxElapsedMs) {
        summary.paused = true;
        break;
      }
      if (summary.processed >= limit) {
        summary.paused = true;
        break;
      }
      cursor += 1;
      summary.scanned += 1;
      if (mappedIds.has(cust.clover_customer_id)) continue;

      const email = normalizeEmail(cust.email);
      const phone = normalizePhone(cust.phone);
      if (!email && !phone) {
        summary.noIdentifiers += 1;
        continue;
      }

      summary.processed += 1;

      try {
        const res = await withRateLimit(
          () =>
            upsertGhlContactV2({
              cloverCustomerId: cust.clover_customer_id,
              firstName: cust.first_name ?? "",
              lastName: cust.last_name ?? "",
              email: email ?? "",
              phone: phone ?? "",
            }),
          { op: "v2_upsert", cloverCustomerId: cust.clover_customer_id },
        );

        if (!res.ok) {
          if (res.rateLimited) {
            summary.rateLimited += 1;
            continue;
          }
        } else {
          // Persist the mapping so this customer is never processed twice.
          await sb.from("customer_mappings").upsert(
            {
              clover_merchant_id: cfg.clover.merchantId,
              clover_customer_id: cust.clover_customer_id,
              ghl_contact_id: res.value.id,
              matched_by: res.value.method === "created" ? "auto_create" : "email",
              match_method: res.value.method === "created" ? "auto_create" : "email",
              clover_email: email,
              clover_phone: phone,
              verified_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
            },
            { onConflict: "clover_merchant_id,clover_customer_id" },
          );
          if (res.value.method === "created") summary.created += 1;
          else summary.matched += 1;
        }
      } catch (e: any) {
        // Identity conflict — log to audit + Needs Review, don't halt batch.
        if (e?.conflict) {
          summary.conflicts += 1;
          try {
            await sb.from("match_audit_log").insert({
              clover_merchant_id: cfg.clover.merchantId,
              clover_customer_id: cust.clover_customer_id,
              match_status: "CONFLICT",
              match_method: "none",
              match_evidence: {
                cloverEmail: email,
                cloverPhone: phone,
                conflictEmailContactId: e.emailContactId,
                conflictPhoneContactId: e.phoneContactId,
                reason: e.message,
              },
              tag_status: "not_applicable",
              error_code: "IDENTITY_CONFLICT",
              error_message: e.message,
            });
          } catch {
            /* best-effort */
          }
        } else {
          summary.errors += 1;
          try {
            await logThrottle({
              op: "v2_upsert",
              status: e?.status ?? 0,
              delayMs: 0,
              attempt: 0,
              cloverCustomerId: cust.clover_customer_id,
              error: e?.message,
            });
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (page.length < Math.min(limit, 100)) {
      // Last page — reset for next run.
      cursor = 0;
      break;
    }
  }

  summary.nextCursor = summary.paused ? cursor : null;
  summary.elapsedMs = Date.now() - startTime;

  // Persist the checkpoint + close the run record.
  try {
    if (runId) {
      await sb
        .from("sync_runs")
        .update({
          status: summary.paused ? "paused" : "completed",
          finished_at: new Date().toISOString(),
          cursor_position: summary.paused ? cursor : 0,
          customers_upserted: summary.matched + summary.created,
        })
        .eq("id", runId);
    }
  } catch {
    /* best-effort */
  }

  return summary;
}
