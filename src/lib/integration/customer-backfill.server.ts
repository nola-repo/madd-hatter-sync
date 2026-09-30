//
// Server-only: CUSTOMER-FIRST bulk backfill pipeline.
//
// PROBLEM THIS SOLVES:
//   The sync engine was strictly ORDER-driven: identity resolution only
//   fired while scanning PAID orders in ["pending","error","held_for_review"].
//   ~600 stranded customers had valid phone/email but NO active order rows,
//   so they were invisible to the loop and stuck at $0 / 0 orders forever.
//
// SOLUTION:
//   This pipeline bypasses transaction queues entirely. It queries the
//   `customers` table directly for profiles that HAVE a usable phone/email
//   identifier but LACK a row in `customer_mappings`, then upserts each one
//   into the CRM and persists the mapping so they are never processed twice.
//
// SAFETY:
//   - Never matches by name alone.
//   - Detects email↔phone identity conflicts → flags CONFLICT, logs to
//     match_audit_log, and pushes to the Needs Review queue WITHOUT halting
//     the rest of the bulk queue (failure isolation).
//   - Fully idempotent via customer_mappings unique constraint.
//   - Rate-limit guarded (429 → exponential backoff), time-boxed to stay
//     well under the 30s cron ceiling.
//
// All secrets read inside functions via getIntegrationConfig().
import { getIntegrationConfig } from "./config.server";
import { getSupabaseServer } from "./supabase.server";
import { normalizeEmail, normalizePhone } from "./matching.server";
import {
  createGhlContact,
  searchContactsByEmail,
  searchContactsByPhone,
  type GhlContact,
} from "./ghl.server";

export type BackfillSummary = {
  scanned: number;
  attempted: number;
  matchedExisting: number;
  autoCreated: number;
  conflicts: number;
  needsReview: number;
  failed: number;
  persistedMappings: number;
  rateLimited: number;
  pausedAtCursor: string | null;
  remaining: number;
  elapsedMs: number;
  errors: string[];
};

const EMPTY: BackfillSummary = {
  scanned: 0,
  attempted: 0,
  matchedExisting: 0,
  autoCreated: 0,
  conflicts: 0,
  needsReview: 0,
  failed: 0,
  persistedMappings: 0,
  rateLimited: 0,
  pausedAtCursor: null,
  remaining: 0,
  elapsedMs: 0,
  errors: [],
};

// ---- Conflict / audit logging ------------------------------------------

async function logBackfillAudit(input: {
  cloverCustomerId: string;
  status: string;
  method: string;
  reason: string;
  email: string | null;
  phone: string | null;
  emailContactId?: string | null;
  phoneContactId?: string | null;
  ghlContactId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const cfg = getIntegrationConfig();
  const sb = getSupabaseServer();
  try {
    await sb.from("match_audit_log").insert({
      clover_merchant_id: cfg.clover.merchantId,
      clover_customer_id: input.cloverCustomerId,
      match_status: input.status,
      match_method: input.method,
      match_evidence: {
        cloverEmail: input.email,
        cloverPhone: input.phone,
        emailCandidateIds: input.emailContactId ? [input.emailContactId] : [],
        phoneCandidateIds: input.phoneContactId ? [input.phoneContactId] : [],
        conflictEmailContactId: input.emailContactId ?? null,
        conflictPhoneContactId: input.phoneContactId ?? null,
        reason: input.reason,
        source: "customer-first-backfill",
      },
      ghl_contact_id: input.ghlContactId ?? null,
      tag_status: "not_applicable",
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    });
  } catch {
    // Audit logging must never break the pipeline.
  }
}

// ---- Rate-limit guard (shared with ingestion layer semantics) ----------

async function logCrmThrottle(label: string, attempt: number, delayMs: number): Promise<void> {
  try {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();
    await sb.from("match_audit_log").insert({
      clover_merchant_id: cfg.clover.merchantId,
      clover_customer_id: `rate-limit:${label}`,
      match_status: "GHL_RATE_LIMITED",
      match_method: "none",
      match_evidence: { label, attempt, delayMs, source: "customer-first-backfill" },
      error_code: "429",
      error_message: `CRM rate limit hit during "${label}". Backing off ${delayMs}ms (attempt ${attempt}).`,
    });
  } catch {
    // Logging must never break the pipeline.
  }
  console.warn(
    `[backfill-rate-limit] ${label} throttled (429) — backoff ${delayMs}ms, attempt ${attempt}`,
  );
}

async function withCrmRateLimitGuard<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode ?? null;
      if (status !== 429 || attempt >= maxRetries) throw e;
      const delayMs = Math.min(8000, 1000 * Math.pow(2, attempt)); // 1s, 2s, 4s...
      await logCrmThrottle(label, attempt + 1, delayMs);
      await new Promise((r) => setTimeout(r, delayMs));
      attempt += 1;
    }
  }
}

// ---- Cursor persistence (so a timed-out batch resumes cleanly) --------

async function getBackfillCursor(): Promise<string | null> {
  try {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from("sync_runs")
      .select("paused_at_cursor")
      .eq("kind", "customer-backfill")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.paused_at_cursor as string) ?? null;
  } catch {
    return null;
  }
}

async function saveBackfillCursor(cursor: string | null): Promise<void> {
  try {
    const sb = getSupabaseServer();
    await sb.from("sync_runs").insert({
      kind: "customer-backfill",
      status: cursor ? "paused" : "completed",
      paused_at_cursor: cursor,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch {
    // Cursor persistence is best-effort.
  }
}

// ---- The canonical backfill --------------------------------------------

/**
 * Backfill stranded customers that have valid identifiers but no mapping.
 *
 * @param limit  Batch size (env SYNC_BATCH_LIMIT overrides; capped at 100
 *               to stay within the 30s cron ceiling).
 * @param maxElapsedMs  Hard time-box. Defaults to 22s so a cron tick never
 *                      times out. Breaks cleanly and saves the cursor.
 */
export async function backfillStrandedCustomers(
  limit?: number,
  maxElapsedMs = 22_000,
): Promise<BackfillSummary> {
  const cfg = getIntegrationConfig();
  const sb = getSupabaseServer();
  const out: BackfillSummary = { ...EMPTY, errors: [] };
  const startedAt = Date.now();

  // Dynamic batch limit: explicit arg → env → default 25.
  const resolvedLimit =
    limit ?? (process.env.SYNC_BATCH_LIMIT ? parseInt(process.env.SYNC_BATCH_LIMIT, 10) : 25);
  const batchLimit = Math.min(100, Math.max(1, resolvedLimit));

  // Find customers WITH a usable email OR phone but WITHOUT a mapping.
  // Anti-join via NOT EXISTS keeps it cheap and avoids loading customer_mappings.
  const { data: strandedRaw, error: qErr } = await sb
    .from("customers")
    .select("clover_customer_id, first_name, last_name, email, phone, created_at")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .or("email.not.is.null,phone.not.is.null")
    .not(
      "clover_customer_id",
      "in",
      `(select clover_customer_id from public.customer_mappings where clover_merchant_id = '${cfg.clover.merchantId.replace(/'/g, "''")}')`,
    )
    .order("created_at", { ascending: false })
    .limit(batchLimit * 3); // over-fetch a little; time-box is the real cap

  if (qErr) {
    out.errors.push(`query stranded customers: ${qErr.message}`);
    out.elapsedMs = Date.now() - startedAt;
    return out;
  }

  const stranded = (strandedRaw ?? []) as Array<{
    clover_customer_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  out.scanned = stranded.length;

  // Resume from the last saved cursor if a previous tick paused.
  const resumeCursor = await getBackfillCursor();
  let startIndex = 0;
  if (resumeCursor) {
    const idx = stranded.findIndex((c) => c.clover_customer_id === resumeCursor);
    if (idx >= 0) startIndex = idx;
  }

  for (let i = startIndex; i < stranded.length; i++) {
    // Hard time-box: stop before 22s so the response always returns.
    if (Date.now() - startedAt > maxElapsedMs) {
      out.pausedAtCursor = stranded[i].clover_customer_id;
      console.log(
        `[backfill] time ceiling reached (${Date.now() - startedAt}ms), pausing at cursor ${out.pausedAtCursor}.`,
      );
      break;
    }

    const c = stranded[i];
    out.attempted += 1;

    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();

    // Skip if normalization wiped out both identifiers (defensive).
    if (!email && !phone) {
      out.needsReview += 1;
      await logBackfillAudit({
        cloverCustomerId: c.clover_customer_id,
        status: "NO_IDENTIFIERS",
        method: "none",
        reason: "Customer row had an email/phone column but both normalized to empty.",
        email: c.email,
        phone: c.phone,
      });
      continue;
    }

    try {
      // 1. Search existing CRM contacts by email AND phone.
      const emailMatches: GhlContact[] = email
        ? await withCrmRateLimitGuard(`backfill-email-search ${c.clover_customer_id}`, () =>
            searchContactsByEmail(email),
          )
        : [];
      const phoneMatches: GhlContact[] = phone
        ? await withCrmRateLimitGuard(`backfill-phone-search ${c.clover_customer_id}`, () =>
            searchContactsByPhone(phone),
          )
        : [];

      // 2. Identity conflict isolation:
      //    email → Contact A, phone → Contact B  → CONFLICT (no auto-pick).
      if (email && phone && emailMatches.length > 0 && phoneMatches.length > 0) {
        const emailIds = new Set(emailMatches.map((m) => m.id));
        const phoneIds = new Set(phoneMatches.map((m) => m.id));
        const overlap = emailMatches.filter((m) => phoneIds.has(m.id));
        const emailOnly = emailMatches.filter((m) => !phoneIds.has(m.id));
        const phoneOnly = phoneMatches.filter((m) => !emailIds.has(m.id));

        if (emailOnly.length > 0 && phoneOnly.length > 0) {
          // Genuine conflict: email and phone point to different contacts.
          out.conflicts += 1;
          await logBackfillAudit({
            cloverCustomerId: c.clover_customer_id,
            status: "CONFLICT",
            method: "none",
            reason:
              `Email matches CRM contact ${emailOnly[0].id} but phone matches a different contact ${phoneOnly[0].id}. ` +
              `Requires human review — no mapping created.`,
            email,
            phone,
            emailContactId: emailOnly[0].id,
            phoneContactId: phoneOnly[0].id,
          });
          continue; // failure-isolated: keep processing the rest of the queue
        }

        // Unambiguous overlap → reuse the single shared contact.
        if (overlap.length === 1) {
          const ghlContactId = overlap[0].id;
          await persistMappingSafe(c.clover_customer_id, ghlContactId, "email_phone", email, phone);
          out.matchedExisting += 1;
          out.persistedMappings += 1;
          await logBackfillAudit({
            cloverCustomerId: c.clover_customer_id,
            status: "MATCHED_EMAIL_PHONE",
            method: "email_phone",
            reason: "Backfill: exact email + phone matched the same CRM contact.",
            email,
            phone,
            ghlContactId,
          });
          continue;
        }
        // Multiple overlapping contacts → ambiguous.
        out.needsReview += 1;
        await logBackfillAudit({
          cloverCustomerId: c.clover_customer_id,
          status: "AMBIGUOUS_MATCH",
          method: "none",
          reason: `${overlap.length} CRM contacts share both this email and phone — cannot auto-resolve.`,
          email,
          phone,
        });
        continue;
      }

      // 3. Unique email match.
      if (emailMatches.length === 1) {
        const ghlContactId = emailMatches[0].id;
        await persistMappingSafe(c.clover_customer_id, ghlContactId, "email", email, phone);
        out.matchedExisting += 1;
        out.persistedMappings += 1;
        await logBackfillAudit({
          cloverCustomerId: c.clover_customer_id,
          status: "MATCHED_EMAIL",
          method: "email",
          reason: "Backfill: exact normalized email uniquely matched one CRM contact.",
          email,
          phone,
          ghlContactId,
        });
        continue;
      }

      // 4. Unique phone match.
      if (phoneMatches.length === 1) {
        const ghlContactId = phoneMatches[0].id;
        await persistMappingSafe(c.clover_customer_id, ghlContactId, "phone", email, phone);
        out.matchedExisting += 1;
        out.persistedMappings += 1;
        await logBackfillAudit({
          cloverCustomerId: c.clover_customer_id,
          status: "MATCHED_PHONE",
          method: "phone",
          reason: "Backfill: exact normalized phone uniquely matched one CRM contact.",
          email,
          phone,
          ghlContactId,
        });
        continue;
      }

      // 5. Multiple matches on a single identifier → ambiguous, needs review.
      if (emailMatches.length > 1 || phoneMatches.length > 1) {
        out.needsReview += 1;
        await logBackfillAudit({
          cloverCustomerId: c.clover_customer_id,
          status: "AMBIGUOUS_MATCH",
          method: "none",
          reason: `Multiple CRM contacts match the same ${emailMatches.length > 1 ? "email" : "phone"} — cannot auto-resolve.`,
          email,
          phone,
        });
        continue;
      }

      // 6. No existing match but we HAVE identifiers → idempotent upsert.
      //    Use "Clover Customer" fallback name if none, tag "clover pos customer".
      const firstName = fullName ? fullName.split(" ")[0] : "Clover";
      const lastName = fullName ? fullName.split(" ").slice(1).join(" ") || "Customer" : "Customer";

      const created = await withCrmRateLimitGuard(`backfill-upsert ${c.clover_customer_id}`, () =>
        createGhlContact({
          firstName,
          lastName,
          email: email ?? "",
          phone: phone ?? "",
          note: `Backfilled from Clover POS. Clover Customer ID: ${c.clover_customer_id}`,
        }),
      );

      if (created?.id) {
        await persistMappingSafe(c.clover_customer_id, created.id, "auto_create", email, phone);
        out.autoCreated += 1;
        out.persistedMappings += 1;
        await logBackfillAudit({
          cloverCustomerId: c.clover_customer_id,
          status: "AUTO_CREATED",
          method: "auto_create",
          reason: `Backfill: no existing CRM match. Auto-created contact for "${fullName || "Clover Customer"}" with available identifiers.`,
          email,
          phone,
          ghlContactId: created.id,
        });
      }
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode ?? null;
      if (status === 429) {
        out.rateLimited += 1;
      }
      out.failed += 1;
      const msg = e?.message ?? String(e);
      out.errors.push(`backfill ${c.clover_customer_id}: ${msg}`);
      await logBackfillAudit({
        cloverCustomerId: c.clover_customer_id,
        status: status === 429 ? "GHL_RATE_LIMITED" : "FAILED",
        method: "none",
        reason: `Backfill processing failed: ${msg}`,
        email,
        phone,
        errorCode: status ? String(status) : null,
        errorMessage: msg,
      });
      // failure-isolated: continue to the next customer
    }
  }

  out.elapsedMs = Date.now() - startedAt;

  // Persist the cursor so the next cron tick resumes exactly here.
  await saveBackfillCursor(out.pausedAtCursor);

  // Estimate remaining stranded customers for monitoring.
  try {
    const { count } = await sb
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("clover_merchant_id", cfg.clover.merchantId)
      .or("email.not.is.null,phone.not.is.null");
    const mappedCount = await sb
      .from("customer_mappings")
      .select("*", { count: "exact", head: true })
      .eq("clover_merchant_id", cfg.clover.merchantId);
    out.remaining = Math.max(0, (count ?? 0) - (mappedCount.count ?? 0));
  } catch {
    // best-effort
  }

  console.log(
    `[backfill] done in ${out.elapsedMs}ms: attempted=${out.attempted} matched=${out.matchedExisting} created=${out.autoCreated} conflicts=${out.conflicts} review=${out.needsReview} failed=${out.failed} remaining=${out.remaining}` +
      (out.pausedAtCursor ? ` pausedAt=${out.pausedAtCursor}` : ""),
  );

  return out;
}

// ---- Idempotent mapping persistence ------------------------------------

async function persistMappingSafe(
  cloverCustomerId: string,
  ghlContactId: string,
  method: string,
  email: string | null,
  phone: string | null,
): Promise<void> {
  const cfg = getIntegrationConfig();
  const sb = getSupabaseServer();
  await sb.from("customer_mappings").upsert(
    {
      clover_merchant_id: cfg.clover.merchantId,
      clover_customer_id: cloverCustomerId,
      ghl_contact_id: ghlContactId,
      matched_by: method,
      match_method: method,
      clover_email: email,
      clover_phone: phone,
      verified_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
    },
    { onConflict: "clover_merchant_id,clover_customer_id" },
  );
}
