//
// Server-only: Purchase-mapping MONITOR queries (stats, review queue, synced list).
//
// Extracted from customer-match.server.ts so that module stays focused on the
// identity resolver.
//
// REVIEW QUEUE POLICY:
//   Instance A (no email/phone/name) and Instance D (name-only) are PERMANENTLY
//   excluded — they can never resolve without new identity data. Only
//   actionable statuses appear: AMBIGUOUS_MATCH (auto-resolvable when email
//   and phone converge) and CONFLICT (needs a human decision).
//
// STATS POLICY:
//   `needsReview` counts only actionable review items (AMBIGUOUS_MATCH).
//   Instance A/D customers are surfaced separately as `skippedNoIdentifiers`
//   so the admin can see how many were bypassed without cluttering the queue.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";

// ---- Stats ---------------------------------------------------------------

export type MappingMonitorStats = {
  totalCloverCustomers: number;
  customersWithPurchases: number;
  matchedGhlContacts: number;
  verifiedMappings: number;
  unmatchedCustomers: number;
  needsReview: number;
  conflicts: number;
  tagsApplied: number;
  tagsVerified: number;
  tagsFailed: number;
  outOfSync: number;
  skippedNoIdentifiers: number;
};

export async function getMappingMonitorStats(): Promise<MappingMonitorStats> {
  const sb = getSupabaseServer();
  const cfg = getIntegrationConfig();

  const { count: totalCustomers } = await sb
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("clover_merchant_id", cfg.clover.merchantId);

  // Count distinct Clover customer IDs that have orders
  const { data: orderCustomers } = await sb
    .from("orders")
    .select("clover_customer_id")
    .not("clover_customer_id", "is", null)
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .limit(10000);
  const customersWithPurchases = new Set(
    (orderCustomers ?? []).map((o: any) => o.clover_customer_id),
  ).size;

  const { count: verifiedMappings } = await sb
    .from("customer_mappings")
    .select("*", { count: "exact", head: true })
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .not("verified_at", "is", null);

  const { count: matchedGhlContacts } = await sb
    .from("customer_mappings")
    .select("*", { count: "exact", head: true })
    .eq("clover_merchant_id", cfg.clover.merchantId);

  // Instance A + D: customers with NO email AND NO phone. These are bypassed
  // by both pipelines and excluded from the mapping table. Counted here so
  // the admin sees the total without them cluttering actionable views.
  const { count: skippedNoIdentifiers } = await sb
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .is("email", null)
    .is("phone", null);

  // Actionable review items: AMBIGUOUS_MATCH only (auto-resolvable when the
  // customer's email and phone converge on one CRM contact). Name-only
  // NEEDS_REVIEW rows are deliberately NOT counted — they never resolve.
  const { count: needsReview } = await sb
    .from("match_audit_log")
    .select("*", { count: "exact", head: true })
    .eq("match_status", "AMBIGUOUS_MATCH");

  const { count: conflicts } = await sb
    .from("match_audit_log")
    .select("*", { count: "exact", head: true })
    .eq("match_status", "CONFLICT");

  const { count: tagsApplied } = await sb
    .from("purchase_tags")
    .select("*", { count: "exact", head: true })
    .eq("status", "applied");

  const { count: tagsVerified } = await sb
    .from("purchase_tags")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "verified");

  const { count: tagsFailed } = await sb
    .from("purchase_tags")
    .select("*", { count: "exact", head: true })
    .in("verification_status", ["failed", "out_of_sync"]);

  const { count: outOfSync } = await sb
    .from("purchase_tags")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "out_of_sync");

  return {
    totalCloverCustomers: totalCustomers ?? 0,
    customersWithPurchases: customersWithPurchases ?? 0,
    matchedGhlContacts: matchedGhlContacts ?? 0,
    verifiedMappings: verifiedMappings ?? 0,
    unmatchedCustomers: Math.max(0, (totalCustomers ?? 0) - (matchedGhlContacts ?? 0)),
    needsReview: needsReview ?? 0,
    conflicts: conflicts ?? 0,
    tagsApplied: tagsApplied ?? 0,
    tagsVerified: tagsVerified ?? 0,
    tagsFailed: tagsFailed ?? 0,
    outOfSync: outOfSync ?? 0,
    skippedNoIdentifiers: skippedNoIdentifiers ?? 0,
  };
}

// ---- Review queue ---------------------------------------------------------

export type ReviewQueueItem = {
  cloverCustomerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  matchStatus: string;
  reason: string;
  evidence: any;
  createdAt: string;
};

/**
 * Actionable review items ONLY: AMBIGUOUS_MATCH and CONFLICT.
 * Instance A (no identifiers) and Instance D (name-only NEEDS_REVIEW) are
 * permanently excluded — they will never resolve without new identity data.
 */
export async function getReviewQueue(limit = 50): Promise<ReviewQueueItem[]> {
  const sb = getSupabaseServer();
  const cfg = getIntegrationConfig();

  // Latest audit entry per customer for ACTIONABLE statuses only.
  const { data } = await sb
    .from("match_audit_log")
    .select("*")
    .in("match_status", ["AMBIGUOUS_MATCH", "CONFLICT"])
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  // Deduplicate by customer, keeping the latest.
  const seen = new Set<string>();
  const deduped: typeof data = [];
  for (const row of data ?? []) {
    if (seen.has(row.clover_customer_id)) continue;
    seen.add(row.clover_customer_id);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }

  if (deduped.length === 0) return [];

  // Single batch query instead of N+1 per-row queries.
  const customerIds = deduped.map((r) => r.clover_customer_id);
  const { data: custsArr } = await sb
    .from("customers")
    .select("clover_customer_id, first_name, last_name, email, phone")
    .in("clover_customer_id", customerIds);
  const custMap = new Map((custsArr ?? []).map((c: any) => [c.clover_customer_id, c]));

  const items: ReviewQueueItem[] = deduped.map((row) => {
    const cust = custMap.get(row.clover_customer_id);
    return {
      cloverCustomerId: row.clover_customer_id,
      customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
      email: cust?.email ?? row.match_evidence?.cloverEmail ?? null,
      phone: cust?.phone ?? row.match_evidence?.cloverPhone ?? null,
      matchStatus: row.match_status,
      reason: row.match_evidence?.reason ?? row.match_status,
      evidence: row.match_evidence,
      createdAt: row.created_at,
    };
  });

  return items;
}

// ---- Synced contacts (verified mappings + applied tags) -------------------

export type SyncedContactRow = {
  cloverCustomerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string;
  matchMethod: string;
  tagsApplied: number;
  tagsVerified: number;
  verifiedAt: string | null;
};

/**
 * Clover customers confidently matched to a CRM contact. These are the
 * "already synced" contacts — the Synced tab reads this.
 */
export async function getSyncedContacts(limit = 100): Promise<{
  total: number;
  contacts: SyncedContactRow[];
}> {
  const sb = getSupabaseServer();
  const cfg = getIntegrationConfig();

  const { data: mappings, error } = await sb
    .from("customer_mappings")
    .select("*")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .not("ghl_contact_id", "is", null)
    .order("verified_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`DB synced mappings: ${error.message}`);

  const rows = (mappings ?? []) as any[];
  if (rows.length === 0) return { total: 0, contacts: [] };

  const customerIds = rows.map((m) => m.clover_customer_id);

  const [{ data: customers }, { data: tags }] = await Promise.all([
    sb.from("customers").select("*").in("clover_customer_id", customerIds).limit(5000),
    sb
      .from("purchase_tags")
      .select("clover_customer_id, status, verification_status")
      .in("clover_customer_id", customerIds),
  ]);

  const customerMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));
  const tagStatsMap = new Map<string, { applied: number; verified: number }>();
  for (const t of tags ?? []) {
    const cur = tagStatsMap.get(t.clover_customer_id) ?? { applied: 0, verified: 0 };
    if (t.status === "applied") cur.applied++;
    if (t.verification_status === "verified") cur.verified++;
    tagStatsMap.set(t.clover_customer_id, cur);
  }

  const contacts: SyncedContactRow[] = rows.map((m) => {
    const cust = customerMap.get(m.clover_customer_id);
    const tagStats = tagStatsMap.get(m.clover_customer_id) ?? { applied: 0, verified: 0 };
    return {
      cloverCustomerId: m.clover_customer_id,
      customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
      email: cust?.email ?? m.clover_email ?? null,
      phone: cust?.phone ?? m.clover_phone ?? null,
      ghlContactId: m.ghl_contact_id,
      matchMethod: m.match_method ?? m.matched_by ?? "unknown",
      tagsApplied: tagStats.applied,
      tagsVerified: tagStats.verified,
      verifiedAt: m.verified_at ?? null,
    };
  });

  const { count } = await sb
    .from("customer_mappings")
    .select("*", { count: "exact", head: true })
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .not("ghl_contact_id", "is", null);

  return { total: count ?? contacts.length, contacts };
}
