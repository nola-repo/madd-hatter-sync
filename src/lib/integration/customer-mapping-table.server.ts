//
// Server-only: Customer Mapping Table query.
//
// Shows ONLY customers with usable identifiers (Instance B/C: email or phone
// present) plus already-matched rows. Instance A (no identifiers) and
// Instance D (name only) are EXCLUDED from the table to avoid cluttering it
// with unresolvable walk-ins. Their count is returned separately.
//
// Extracted from customer-match.server.ts to keep that file focused.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";

export type CustomerMappingRow = {
  cloverCustomerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  purchaseCount: number;
  ghlContactId: string | null;
  matchMethod: string | null;
  matchStatus: string;
  tagCount: number;
  syncStatus: string;
};

export type CustomerMappingTableResult = {
  rows: CustomerMappingRow[];
  skippedNoIdentifiers: number;
};

export async function getCustomerMappingTable(limit = 1000): Promise<CustomerMappingTableResult> {
  const sb = getSupabaseServer();
  const cfg = getIntegrationConfig();

  // Get customers with their order counts.
  const { data: orders } = await sb
    .from("orders")
    .select("clover_customer_id, clover_order_id")
    .eq("clover_merchant_id", cfg.clover.merchantId)
    .not("clover_customer_id", "is", null)
    .limit(5000);

  const orderCountMap = new Map<string, number>();
  for (const o of orders ?? []) {
    const cid = o.clover_customer_id as string;
    orderCountMap.set(cid, (orderCountMap.get(cid) ?? 0) + 1);
  }

  const customerIds = [...orderCountMap.keys()];
  if (customerIds.length === 0) return { rows: [], skippedNoIdentifiers: 0 };

  const { data: customers } = await sb
    .from("customers")
    .select("*")
    .in("clover_customer_id", customerIds)
    .limit(5000);
  const customerMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));

  const { data: mappings } = await sb
    .from("customer_mappings")
    .select("*")
    .in("clover_customer_id", customerIds);
  const mappingMap = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id, m]));

  const { data: tags } = await sb
    .from("purchase_tags")
    .select("clover_customer_id, status, verification_status")
    .in("clover_customer_id", customerIds);
  const tagCountMap = new Map<string, number>();
  for (const t of tags ?? []) {
    tagCountMap.set(t.clover_customer_id, (tagCountMap.get(t.clover_customer_id) ?? 0) + 1);
  }

  const rows: CustomerMappingRow[] = [];
  let skippedNoIdentifiers = 0;

  for (const cid of customerIds) {
    const cust = customerMap.get(cid);
    const mapping = mappingMap.get(cid);
    const tagCount = tagCountMap.get(cid) ?? 0;
    const hasIdentifiers = !!(cust?.email || cust?.phone);

    // Exclude Instance A (no identifiers) and Instance D (name only, no
    // identifiers) from the table unless they are already matched.
    if (!hasIdentifiers && !mapping) {
      skippedNoIdentifiers += 1;
      continue;
    }

    const matchStatus = mapping ? "MATCHED" : hasIdentifiers ? "NO_GHL_MATCH" : "NO_IDENTIFIERS";
    // A confirmed customer_mappings record = the contact exists in CRM = SYNCED.
    // Tags are a separate enrichment layer reflected in the Tags column.
    const syncStatus = mapping ? "SYNCED" : "NOT_SYNCED";

    rows.push({
      cloverCustomerId: cid,
      customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
      email: cust?.email ?? null,
      phone: cust?.phone ?? null,
      purchaseCount: orderCountMap.get(cid) ?? 0,
      ghlContactId: mapping?.ghl_contact_id ?? null,
      matchMethod: mapping?.match_method ?? mapping?.matched_by ?? null,
      matchStatus,
      tagCount,
      syncStatus,
    });
  }

  rows.sort((a, b) => b.purchaseCount - a.purchaseCount);
  return { rows: rows.slice(0, limit), skippedNoIdentifiers };
}
