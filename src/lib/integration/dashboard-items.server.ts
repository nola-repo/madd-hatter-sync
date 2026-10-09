//
// Server-only: dashboard aggregation, extracted from pos-data.server.ts.
//
// Fixes two bugs:
//  1. "Items Sold = 0 / Top Items = none / Top Category = —": the old code
//     did a single unfiltered .from("order_items").select("*").limit(100000)
//     which PostgREST caps at ~1,000 rows, returning an arbitrary slice that
//     rarely overlapped the selected date range. We now fetch items filtered
//     by the range's order UUIDs in chunked, paginated queries.
//  2. Month/all-time row cap: orders are now paginated (1,000 per request)
//     so the month shows all orders, not just the first 1,000.
//
// Net sales definition is unchanged (line items minus line discounts).
import { getSupabaseServer } from "./supabase.server";
import { rangeToMs, type RangeLabel } from "./clover-dates.server";
import { deriveSyncStatus } from "./format";
import type { OrderRow, OrderItemRow } from "./supabase.server";
import type { DashboardStats, OrderListItem } from "./types";

/**
 * Canonical sales value for an order.
 * net_sales_cents (line-item derived, matches Clover Net Sales) is primary.
 * Falls back to net_total_cents then total_cents only for legacy rows.
 */
function salesOf(o: OrderRow): number {
  return o.net_sales_cents ?? o.net_total_cents ?? o.total_cents ?? 0;
}

/** An order counts toward "paid sales" only if PAID and not voided. */
function isPaidSale(o: OrderRow): boolean {
  return o.payment_status === "PAID" && !o.voided;
}

function mapOrder(o: OrderRow): OrderListItem {
  return {
    id: o.id,
    cloverOrderId: o.clover_order_id,
    cloverCustomerId: o.clover_customer_id,
    ghlContactId: o.ghl_contact_id,
    status: o.status,
    paymentStatus: o.payment_status,
    currency: o.currency,
    totalCents: o.total_cents,
    createdTime: o.created_time,
    locationName: o.location_name,
    mappingStatus: o.mapping_status,
    matchMethod: o.match_method,
    processedAt: o.processed_at,
    syncStatus: deriveSyncStatus(o),
  };
}

/**
 * Fetch order_items for a set of order UUIDs in paginated chunks.
 * PostgREST caps results at ~1,000 rows per request and caps .in() lists,
 * so we chunk the order_id list (<=200 per request) and paginate within
 * each chunk to retrieve every matching item.
 */
export async function fetchItemsForOrders(orderIds: string[]): Promise<OrderItemRow[]> {
  const sb = getSupabaseServer();
  const out: OrderItemRow[] = [];
  const CHUNK = 200; // PostgREST .in() list safety cap
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK);
    if (slice.length === 0) break;
    let off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await sb
        .from("order_items")
        .select("*")
        .in("order_id", slice)
        .order("created_at", { ascending: false })
        .range(off, off + 999);
      if (error) throw new Error(`DB items: ${error.message}`);
      const rows = (data ?? []) as OrderItemRow[];
      for (const r of rows) out.push(r);
      if (rows.length < 1000) break;
      off += 1000;
    }
  }
  return out;
}

export type TopItem = {
  name: string;
  category: string | null;
  quantity: number;
  revenueCents: number;
};
export type TopCategory = { name: string; revenueCents: number };

export type ItemAggregation = {
  itemsSold: number;
  topItems: TopItem[];
  topCategories: TopCategory[];
};

/**
 * Aggregate item-level stats for a set of items (already filtered to the
 * target range). Returns items sold, top 6 items by quantity, and top 6
 * categories by revenue.
 */
export function aggregateItems(items: OrderItemRow[]): ItemAggregation {
  const itemsSold = items.reduce((s, i) => s + (i.quantity || 0), 0);

  const itemAgg = new Map<
    string,
    { name: string; category: string | null; qty: number; revenue: number }
  >();
  for (const it of items) {
    const key = it.item_name;
    const e = itemAgg.get(key) ?? { name: key, category: it.category, qty: 0, revenue: 0 };
    e.qty += it.quantity || 0;
    e.revenue += it.line_total_cents || 0;
    itemAgg.set(key, e);
  }
  const topItems: TopItem[] = [...itemAgg.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6)
    .map((e) => ({ name: e.name, category: e.category, quantity: e.qty, revenueCents: e.revenue }));

  const catAgg = new Map<string, number>();
  for (const it of items) {
    const k = it.category || "Uncategorized";
    catAgg.set(k, (catAgg.get(k) || 0) + (it.line_total_cents || 0));
  }
  const topCategories: TopCategory[] = [...catAgg.entries()]
    .map(([name, revenueCents]) => ({ name, revenueCents }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 6);

  return { itemsSold, topItems, topCategories };
}

/**
 * Paginated fetch of ALL orders (no date filter), 1,000 rows per request,
 * so all-time totals are complete and not capped at PostgREST's 1,000-row
 * default.
 */
async function fetchAllOrdersPaginated(): Promise<OrderRow[]> {
  const sb = getSupabaseServer();
  const out: OrderRow[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from("orders")
      .select("*")
      .order("created_time", { ascending: false })
      .range(off, off + 999);
    if (error) throw new Error(`DB orders: ${error.message}`);
    const rows = (data ?? []) as OrderRow[];
    for (const r of rows) out.push(r);
    if (rows.length < 1000) break;
    off += 1000;
  }
  return out;
}

export async function getDashboardStats(opts?: {
  range?: "today" | "week" | "month" | "all";
}): Promise<DashboardStats> {
  const sb = getSupabaseServer();
  const activeRange = opts?.range ?? "today";

  // Use the SAME canonical date-range utility as the ingestion layer so the
  // dashboard aggregation and the Clover API fetch always agree on boundaries.
  const range = rangeToMs(activeRange as RangeLabel);

  // Fetch orders in the selected range using DB-side filtering on created_time.
  const { data: rangeOrders, error: roErr } = await sb
    .from("orders")
    .select("*")
    .gte("created_time", range.startMs)
    .lte("created_time", range.endMs)
    .order("created_time", { ascending: false })
    .limit(100000);
  if (roErr) throw new Error(`DB range orders: ${roErr.message}`);
  const targetOrders = (rangeOrders ?? []) as OrderRow[];

  // Fetch ALL orders (paginated) for the all-time totals cards.
  const orderRows = await fetchAllOrdersPaginated();

  // Fetch order items for the selected range, filtered by the range's order
  // IDs in chunked paginated queries (bypasses the PostgREST 1,000-row cap).
  const rangeOrderIds = targetOrders.map((o) => o.id);
  const targetItems = await fetchItemsForOrders(rangeOrderIds);

  // All-time items sold: aggregate from the full order set via the same
  // chunked fetch so the all-time card is not capped at 1,000 items.
  const allOrderIds = orderRows.map((o) => o.id);
  const allItems = await fetchItemsForOrders(allOrderIds);

  // ---- All-time totals (for the secondary cards) ----
  const paidOrdersAll = orderRows.filter(isPaidSale);
  const totalSalesCents = paidOrdersAll.reduce((s, o) => s + salesOf(o), 0);
  const totalOrders = orderRows.filter((o) => !o.voided).length;
  const customerIdsAll = new Set(
    orderRows
      .filter((o) => !o.voided)
      .map((o) => o.clover_customer_id)
      .filter(Boolean) as string[],
  );
  const totalCustomers = customerIdsAll.size;
  const totalItemsSold = allItems.reduce((s, i) => s + (i.quantity || 0), 0);

  // ---- Today / This Week / This Month (all derived from canonical ranges) ----
  const todayRange = rangeToMs("today");
  const weekRange = rangeToMs("week");
  const monthRange = rangeToMs("month");
  const inRange = (o: OrderRow, r: { startMs: number; endMs: number }) =>
    (o.created_time || 0) >= r.startMs && (o.created_time || 0) <= r.endMs;

  const todayOrders = orderRows.filter((o) => inRange(o, todayRange) && !o.voided);
  const thisWeekOrders = orderRows.filter((o) => inRange(o, weekRange) && !o.voided);
  const thisMonthOrders = orderRows.filter((o) => inRange(o, monthRange) && !o.voided);
  const todaySalesCents = todayOrders.filter(isPaidSale).reduce((s, o) => s + salesOf(o), 0);
  const thisWeekSalesCents = thisWeekOrders.filter(isPaidSale).reduce((s, o) => s + salesOf(o), 0);
  const thisMonthSalesCents = thisMonthOrders
    .filter(isPaidSale)
    .reduce((s, o) => s + salesOf(o), 0);

  // ---- Filtered (active range) metrics — the primary dashboard cards ----
  const filteredPaidOrders = targetOrders.filter(isPaidSale);
  const filteredSalesCents = filteredPaidOrders.reduce((s, o) => s + salesOf(o), 0);
  const filteredOrdersCount = targetOrders.filter((o) => !o.voided).length;
  const filteredPaidOrdersCount = filteredPaidOrders.length;
  const filteredAov = filteredPaidOrders.length
    ? Math.round(filteredSalesCents / filteredPaidOrders.length)
    : 0;
  const filteredCustomerIds = new Set(
    targetOrders
      .filter((o) => !o.voided)
      .map((o) => o.clover_customer_id)
      .filter(Boolean) as string[],
  );
  const filteredCustomersCount = filteredCustomerIds.size;
  const filteredItemsSoldCount = targetItems.reduce((s, i) => s + (i.quantity || 0), 0);

  const aov = paidOrdersAll.length ? Math.round(totalSalesCents / paidOrdersAll.length) : 0;

  // Top items + top categories via the shared aggregator.
  const { topItems, topCategories } = aggregateItems(targetItems);

  const recentOrders = targetOrders.slice(0, 8).map(mapOrder);

  return {
    hasData: orderRows.length > 0,
    filterRange: activeRange,
    totalSalesCents,
    totalOrders,
    totalCustomers,
    totalItemsSold,
    todaySalesCents,
    todayOrdersCount: todayOrders.length,
    thisWeekSalesCents,
    thisWeekOrdersCount: thisWeekOrders.length,
    thisMonthSalesCents,
    thisMonthOrdersCount: thisMonthOrders.length,
    filteredSalesCents,
    filteredOrdersCount,
    filteredPaidOrdersCount,
    filteredAverageOrderValueCents: filteredAov,
    filteredCustomersCount,
    filteredItemsSoldCount,
    averageOrderValueCents: aov,
    topItems,
    topCategories,
    recentOrders,
  };
}
