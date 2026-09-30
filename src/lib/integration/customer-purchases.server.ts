import { getSupabaseServer } from "./supabase.server";
import { rangeToMs, type RangeLabel } from "./clover-dates.server";
import type { CustomerPurchaseRow } from "./pos-data.server";

export async function listFilteredCustomersWithPurchases(opts: {
  search?: string;
  limit?: number;
  offset?: number;
  range?: RangeLabel;
}): Promise<{ rows: CustomerPurchaseRow[]; total: number }> {
  const sb = getSupabaseServer();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // Step 1: Base customer query
  let custQuery = sb
    .from("customers")
    .select("clover_customer_id, first_name, last_name, email, phone", { count: "exact" });

  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    custQuery = custQuery.or(
      `first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`,
    );
  }

  const { data: customers, count: totalCount } = await custQuery.range(offset, offset + limit - 1);
  if (!customers || customers.length === 0) {
    return { rows: [], total: totalCount ?? 0 };
  }

  let customerIds = customers.map((c: any) => c.clover_customer_id);

  // Step 2: Date-range filtering on orders
  let orderQuery = sb
    .from("orders")
    .select("clover_order_id, clover_customer_id, total_cents, created_time");

  if (opts.range) {
    const { startMs, endMs } = rangeToMs(opts.range);
    orderQuery = orderQuery.gte("created_time", startMs).lte("created_time", endMs);
  }

  const { data: orders } = await orderQuery.in("clover_customer_id", customerIds);

  const custSpendMap = new Map<
    string,
    { totalSpend: number; count: number; lastVisit: number; orderIds: string[] }
  >();
  for (const o of orders ?? []) {
    const cid = o.clover_customer_id;
    if (!cid) continue;
    const existing = custSpendMap.get(cid) ?? {
      totalSpend: 0,
      count: 0,
      lastVisit: 0,
      orderIds: [],
    };
    existing.totalSpend += o.total_cents ?? 0;
    existing.count += 1;
    existing.orderIds.push(o.clover_order_id);
    if ((o.created_time ?? 0) > existing.lastVisit) {
      existing.lastVisit = o.created_time;
    }
    custSpendMap.set(cid, existing);
  }

  // If a specific date range was requested, filter to customers active in that window
  if (opts.range) {
    customerIds = customerIds.filter((cid) => custSpendMap.has(cid));
  }

  const custMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));

  // Step 3: Fetch items purchased
  const relevantOrderIds: string[] = [];
  for (const cid of customerIds) {
    const agg = custSpendMap.get(cid);
    if (agg) relevantOrderIds.push(...agg.orderIds);
  }

  const custItemsMap = new Map<string, Map<string, number>>();
  if (relevantOrderIds.length > 0) {
    const orderOwnerMap = new Map<string, string>();
    for (const cid of customerIds) {
      const agg = custSpendMap.get(cid);
      if (agg) {
        for (const oid of agg.orderIds) orderOwnerMap.set(oid, cid);
      }
    }

    const { data: items } = await sb
      .from("order_items")
      .select("clover_order_id, name, quantity")
      .in("clover_order_id", relevantOrderIds.slice(0, 500));

    for (const it of items ?? []) {
      const cid = orderOwnerMap.get(it.clover_order_id);
      if (!cid || !it.name) continue;
      if (!custItemsMap.has(cid)) custItemsMap.set(cid, new Map());
      const imap = custItemsMap.get(cid)!;
      imap.set(it.name, (imap.get(it.name) ?? 0) + (it.quantity ?? 1));
    }
  }

  // Step 4: CRM match status from customer_mappings
  const { data: mappings } = await sb
    .from("customer_mappings")
    .select("clover_customer_id, ghl_contact_id, match_method")
    .in("clover_customer_id", customerIds);

  const mapByCid = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id, m]));

  const rows: CustomerPurchaseRow[] = customerIds.map((cid) => {
    const c = custMap.get(cid) ?? {};
    const spend = custSpendMap.get(cid) ?? { totalSpend: 0, count: 0, lastVisit: 0, orderIds: [] };
    const mapping = mapByCid.get(cid);

    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const name = fullName || "Unknown";

    let matchStatus: CustomerPurchaseRow["matchStatus"] = "NO_IDENTIFIERS";
    let matchMethod: string | null = null;
    let ghlContactId: string | null = null;

    if (mapping) {
      matchStatus = mapping.match_method === "auto_create" ? "AUTO_CREATED" : "MATCHED";
      matchMethod = mapping.match_method ?? null;
      ghlContactId = mapping.ghl_contact_id ?? null;
    } else if (c.email || c.phone) {
      matchStatus = "NO_GHL_MATCH";
    }

    const imap = custItemsMap.get(cid) ?? new Map<string, number>();
    const itemsPurchased = Array.from(imap.entries()).map(([name, qty]) => ({ name, qty }));

    return {
      cloverCustomerId: cid,
      customerName: name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      totalSpendCents: spend.totalSpend,
      orderCount: spend.count,
      lastVisitMs: spend.lastVisit,
      matchStatus,
      matchMethod,
      ghlContactId,
      itemsPurchased,
    };
  });

  return { rows, total: totalCount ?? rows.length };
}
