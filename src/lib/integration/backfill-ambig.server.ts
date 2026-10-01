//
// Server-only: AMBIGUOUS auto-resolve pass for the customer backfill.
//
// Re-examines AMBIGUOUS_MATCH audit rows: if the customer's email AND phone
// now both resolve to the SAME single CRM contact, auto-resolve to MATCHED
// and persist the mapping. Genuine CONFLICTs (two different contacts) stay
// held for human review.
//
// Self-contained (does not import backfill internals) to keep modules focused.
import { getIntegrationConfig, type IntegrationConfig } from "./config.server";
import { getSupabaseServer, type SupabaseClient } from "./supabase.server";
import { normalizeEmail, normalizePhone } from "./matching.server";
import { searchContactsByEmail, searchContactsByPhone, type GhlContact } from "./ghl.server";
import { applyPurchaseTag, purchaseTagLabel, normalizeItemName } from "./ghl-tags.server";
import type { BackfillSummary } from "./customer-backfill.server";

// ---- minimal audit + persistence (local copies) -----------------------

async function logAudit(input: {
  cloverCustomerId: string;
  status: string;
  method: string;
  reason: string;
  email: string | null;
  phone: string | null;
  ghlContactId?: string | null;
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
        reason: input.reason,
        source: "backfill-ambig-resolve",
      },
      ghl_contact_id: input.ghlContactId ?? null,
      tag_status: "not_applicable",
    });
  } catch {
    /* never break the pipeline */
  }
}

async function persistMapping(
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

async function applyTags(cloverCustomerId: string, ghlContactId: string): Promise<void> {
  try {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();
    const { data: orders } = await sb
      .from("orders")
      .select("id")
      .eq("clover_customer_id", cloverCustomerId);
    if (!orders || orders.length === 0) return;
    const orderIds = orders.map((o) => o.id);
    const { data: items } = await sb
      .from("order_items")
      .select("item_name")
      .in("order_id", orderIds.slice(0, 100));
    if (!items || items.length === 0) return;
    const uniqueItems = Array.from(new Set(items.map((it) => it.item_name).filter(Boolean)));
    for (const itemName of uniqueItems.slice(0, 3)) {
      try {
        const res = await applyPurchaseTag(ghlContactId, itemName);
        if (res.status === "applied" || res.status === "already_tagged") {
          await sb.from("purchase_tags").upsert(
            {
              clover_merchant_id: cfg.clover.merchantId,
              clover_customer_id: cloverCustomerId,
              ghl_contact_id: ghlContactId,
              item_name: itemName,
              normalized_item_name: normalizeItemName(itemName),
              expected_tag: purchaseTagLabel(itemName),
              status: "applied",
              attempt_count: 1,
              last_attempt_at: new Date().toISOString(),
              last_success_at: new Date().toISOString(),
            },
            { onConflict: "clover_customer_id,normalized_item_name" },
          );
        }
      } catch {
        /* non-blocking per item */
      }
    }
  } catch {
    /* non-blocking */
  }
}

async function mappedHas(
  sb: SupabaseClient,
  cfg: IntegrationConfig,
  cid: string,
): Promise<boolean> {
  const { data } = await sb
    .from("customer_mappings")
    .select("clover_customer_id")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .eq("clover_customer_id", cid)
    .maybeSingle();
  return !!data;
}

// ---- the pass ---------------------------------------------------------

export async function autoResolveAmbiguous(
  cfg: IntegrationConfig,
  out: BackfillSummary,
  startedAt: number,
  maxElapsedMs: number,
): Promise<void> {
  const sb = getSupabaseServer();
  const { data: ambigRows } = await sb
    .from("match_audit_log")
    .select("clover_customer_id, match_evidence")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .eq("match_status", "AMBIGUOUS_MATCH")
    .order("created_at", { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const candidates = (ambigRows ?? []).filter((r: any) => {
    if (seen.has(r.clover_customer_id)) return false;
    seen.add(r.clover_customer_id);
    return true;
  });

  for (const row of candidates as any[]) {
    if (Date.now() - startedAt > maxElapsedMs) break;
    const cid = row.clover_customer_id as string;
    if (await mappedHas(sb, cfg, cid)) continue;

    const { data: cust } = await sb
      .from("customers")
      .select("email, phone")
      .eq("clover_merchant_id", cfg.clover.merchantId)
      .eq("clover_customer_id", cid)
      .maybeSingle();
    const email = normalizeEmail(cust?.email);
    const phone = normalizePhone(cust?.phone);
    if (!email || !phone) continue;

    let emailMatches: GhlContact[] = [];
    let phoneMatches: GhlContact[] = [];
    try {
      emailMatches = email ? await searchContactsByEmail(email) : [];
      phoneMatches = phone ? await searchContactsByPhone(phone) : [];
    } catch {
      continue;
    }
    if (emailMatches.length === 0 || phoneMatches.length === 0) continue;

    const phoneIds = new Set(phoneMatches.map((m) => m.id));
    const overlap = emailMatches.filter((m) => phoneIds.has(m.id));
    if (overlap.length === 1) {
      const ghlContactId = overlap[0].id;
      await persistMapping(cid, ghlContactId, "email_phone", email, phone);
      out.matchedExisting += 1;
      out.persistedMappings += 1;
      await logAudit({
        cloverCustomerId: cid,
        status: "MATCHED_EMAIL_PHONE",
        method: "email_phone",
        reason: "Auto-resolved AMBIGUOUS: email and phone now point to the same CRM contact.",
        email,
        phone,
        ghlContactId,
      });
      await applyTags(cid, ghlContactId);
    }
  }
}
