//
// Server-only rate-limit / throttle guard for GHL API calls.
// Handles GHL's ~100 requests / 10s limit by catching 429 (and transient 5xx)
// and applying a short exponential backoff. Throttle events are written to
// match_audit_log so they are visible in the "Needs Review" / logs UI instead
// of crashing the pipeline or silently dropping the contact.
//
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";

/**
 * Persist a throttle / rate-limit event to match_audit_log. Best-effort: never
 * throws (audit logging must not break the main pipeline).
 */
export async function logThrottle(input: {
  op: string;
  status: number;
  delayMs: number;
  attempt: number;
  cloverCustomerId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();
    await sb.from("match_audit_log").insert({
      clover_merchant_id: cfg.clover.merchantId,
      clover_customer_id: input.cloverCustomerId ?? "",
      match_status: "RATE_LIMITED",
      match_method: "none",
      match_evidence: {
        op: input.op,
        httpStatus: input.status,
        delayMs: input.delayMs,
        attempt: input.attempt,
        throttled: true,
      },
      tag_status: "not_applicable",
      error_code: input.status === 429 ? "GHL_429" : `GHL_${input.status}`,
      error_message:
        input.error ?? `GHL rate limit / transient error ${input.status} on ${input.op}`,
    });
  } catch {
    // Audit logging must never break the pipeline.
  }
}

/**
 * Wrap a GHL thunk with a bounded rate-limit guard.
 * - On 429 or 5xx: wait (exponential backoff), log, retry once.
 * - If the retry also fails with 429/5xx: log again and return a rateLimited
 *   sentinel so the caller can skip this record and continue the batch
 *   (failure isolation) instead of crashing.
 * - Non-rate-limit errors are re-thrown for the caller to handle.
 */
export async function withRateLimit<T>(
  thunk: () => Promise<T>,
  ctx: { op: string; cloverCustomerId?: string | null },
): Promise<{ ok: true; value: T } | { ok: false; rateLimited: true; status: number }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (e: any) {
    const status: number = e?.status ?? 0;
    if (status === 429 || (status >= 500 && status < 600)) {
      const delayMs = 1500;
      try {
        await logThrottle({
          op: ctx.op,
          status,
          delayMs,
          attempt: 0,
          ...(ctx.cloverCustomerId !== undefined ? { cloverCustomerId: ctx.cloverCustomerId } : {}),
          error:
            typeof e?.body === "string"
              ? e.body.slice(0, 200)
              : e?.message != null
                ? String(e.message)
                : null,
        });
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, delayMs));
      try {
        const value = await thunk();
        return { ok: true, value };
      } catch (e2: any) {
        const s2: number = e2?.status ?? 0;
        try {
          await logThrottle({
            op: ctx.op,
            status: s2,
            delayMs: 0,
            attempt: 1,
            ...(ctx.cloverCustomerId !== undefined ? { cloverCustomerId: ctx.cloverCustomerId } : {}),
            error:
              typeof e2?.body === "string"
                ? e2.body.slice(0, 200)
                : e2?.message != null
                  ? String(e2.message)
                  : null,
          });
        } catch {
          /* ignore */
        }
        return { ok: false, rateLimited: true, status: s2 };
      }
    }
    throw e;
  }
}
