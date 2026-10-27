//
// Server-only: Audience Builder query engine.
// Powers the /admin/audience-builder page.
//
// Types and presets are shared with the client via audience-presets.ts.
import { getSupabaseServer } from "./supabase.server";
import type {
  FilterType,
  FilterCondition,
  ConditionGroup,
  AudienceQuery,
  AudienceCustomerRow,
  AudienceBuildResult,
} from "./audience-presets";

// Re-export types and presets so importers only need this one file
export type {
  FilterType,
  FilterCondition,
  ConditionGroup,
  AudienceQuery,
  AudienceCustomerRow,
  AudienceBuildResult,
} from "./audience-presets";

export { AUDIENCE_PRESETS } from "./audience-presets";

// ---- Main engine --------------------------------------------------------

export async function buildAudience(query: AudienceQuery): Promise<AudienceBuildResult> {
  const t0 = Date.now();
  const sb = getSupabaseServer();

  // ---- Step 1: Load raw data from DB ------------------------------------
  // We load all orders with customers in one pass — this avoids N+1 and is
  // fast enough for the data volumes a Clover restaurant produces.
  const { data: orderRows, error: oErr } = await sb
    .from("orders")
    .select(
      "id, clover_customer_id, clover_order_id, total_cents, net_sales_cents, created_time, payment_status, voided",
    )
    .not("clover_customer_id", "is", null)
    .limit(100_000);

  if (oErr) throw new Error(`DB orders error: ${oErr.message}`);

  // Load order items for category/item filters (only if needed)
  const needsItemData = query.groups.some((g) =>
    g.conditions.some((c) => c.type === "category_buyer" || c.type === "item_buyer"),
  );

  const orderItemsMap = new Map<string, Array<{ itemName: string; category: string | null }>>();

  if (needsItemData) {
    const { data: items, error: iErr } = await sb
      .from("order_items")
      .select("order_id, item_name, category")
      .limit(500_000);
    if (iErr) throw new Error(`DB order_items error: ${iErr.message}`);
    for (const it of items ?? []) {
      const list = orderItemsMap.get(it.order_id) ?? [];
      list.push({
        itemName: (it.item_name ?? "").toLowerCase(),
        category: (it.category ?? "").toLowerCase(),
      });
      orderItemsMap.set(it.order_id, list);
    }
  }

  // ---- Step 2: Aggregate per customer ------------------------------------
  type CustAgg = {
    orderIds: string[];
    totalSpendCents: number;
    maxSingleOrderCents: number;
    lastVisitMs: number;
    orderCount: number;
    categorySet: Set<string>;
    itemSet: Set<string>;
  };

  const custAgg = new Map<string, CustAgg>();
  for (const o of orderRows ?? []) {
    const cid = o.clover_customer_id as string;
    if (!cid) continue;

    const salesCents = (o.net_sales_cents ?? o.total_cents ?? 0) as number;
    const ts = typeof o.created_time === "number" ? (o.created_time as number) : 0;

    const existingEntry = custAgg.get(cid);
    if (!existingEntry) {
      const entry: CustAgg = {
        orderIds: [o.id],
        totalSpendCents: salesCents,
        maxSingleOrderCents: salesCents,
        lastVisitMs: ts,
        orderCount: 1,
        categorySet: new Set<string>(),
        itemSet: new Set<string>(),
      };
      if (needsItemData) {
        for (const it of orderItemsMap.get(o.id) ?? []) {
          if (it.category) entry.categorySet.add(it.category);
          if (it.itemName) entry.itemSet.add(it.itemName);
        }
      }
      custAgg.set(cid, entry);
    } else {
      existingEntry.orderIds.push(o.id);
      existingEntry.totalSpendCents += salesCents;
      existingEntry.maxSingleOrderCents = Math.max(existingEntry.maxSingleOrderCents, salesCents);
      existingEntry.lastVisitMs = Math.max(existingEntry.lastVisitMs, ts);
      existingEntry.orderCount += 1;
      if (needsItemData) {
        for (const it of orderItemsMap.get(o.id) ?? []) {
          if (it.category) existingEntry.categorySet.add(it.category);
          if (it.itemName) existingEntry.itemSet.add(it.itemName);
        }
      }
    }
  }

  // ---- Step 3: Load customer profiles & mappings ------------------------
  const allCustomerIds = [...custAgg.keys()];
  if (allCustomerIds.length === 0) {
    return {
      customers: [],
      total: 0,
      queryMs: Date.now() - t0,
      summary: "No customer data found.",
    };
  }

  const { data: customers } = await sb
    .from("customers")
    .select("clover_customer_id, first_name, last_name, email, phone")
    .in("clover_customer_id", allCustomerIds)
    .limit(100_000);

  const { data: mappings } = await sb
    .from("customer_mappings")
    .select("clover_customer_id, ghl_contact_id, matched_by")
    .in("clover_customer_id", allCustomerIds)
    .limit(100_000);

  const custMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id as string, c]));
  const mappingMap = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id as string, m]));

  // ---- Step 4: Evaluate filters per customer ----------------------------
  const nowMs = Date.now();

  function evaluateCondition(agg: CustAgg, cond: FilterCondition): boolean {
    switch (cond.type) {
      case "single_check_gte": {
        const threshCents = (cond.thresholdDollars ?? 0) * 100;
        return agg.maxSingleOrderCents >= threshCents;
      }
      case "total_spend_gte": {
        const threshCents = (cond.thresholdDollars ?? 0) * 100;
        return agg.totalSpendCents >= threshCents;
      }
      case "visit_count_gte": {
        return agg.orderCount >= (cond.visitCount ?? 1);
      }
      case "last_visit_within": {
        const cutoffMs = nowMs - (cond.days ?? 30) * 24 * 60 * 60 * 1000;
        return agg.lastVisitMs >= cutoffMs;
      }
      case "category_buyer": {
        if (!cond.name) return false;
        const needle = cond.name.toLowerCase();
        return [...agg.categorySet].some((cat) => cat.includes(needle));
      }
      case "item_buyer": {
        if (!cond.name) return false;
        const needle = cond.name.toLowerCase();
        return [...agg.itemSet].some((item) => item.includes(needle));
      }
      default:
        return false;
    }
  }

  function evaluateGroup(
    agg: CustAgg,
    group: ConditionGroup,
  ): { pass: boolean; matched: string[] } {
    const matched: string[] = [];
    for (const cond of group.conditions) {
      if (evaluateCondition(agg, cond)) {
        matched.push(cond.label);
      }
    }
    // Within a group, ANY condition matching = group passes (OR logic within group)
    return { pass: matched.length > 0, matched };
  }

  const result: AudienceCustomerRow[] = [];

  for (const [cid, agg] of custAgg.entries()) {
    const groupResults = query.groups.map((g) => evaluateGroup(agg, g));
    const allMatched: string[] = groupResults.flatMap((gr) => gr.matched);

    // Apply MATCH ALL (AND) or MATCH ANY (OR) across groups
    const passes = query.matchAllGroups
      ? groupResults.every((gr) => gr.pass)
      : groupResults.some((gr) => gr.pass);

    if (!passes) continue;

    const cust = custMap.get(cid);
    const mapping = mappingMap.get(cid);
    const matchStatus: "MATCHED" | "UNMATCHED" | "NO_IDENTIFIERS" = mapping
      ? "MATCHED"
      : cust?.email || cust?.phone
        ? "UNMATCHED"
        : "NO_IDENTIFIERS";

    result.push({
      cloverCustomerId: cid,
      customerName: cust
        ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") || "Clover Customer"
        : "Unknown Customer",
      email: cust?.email ?? null,
      phone: cust?.phone ?? null,
      ghlContactId: mapping?.ghl_contact_id ?? null,
      matchStatus,
      orderCount: agg.orderCount,
      totalSpendCents: agg.totalSpendCents,
      maxSingleOrderCents: agg.maxSingleOrderCents,
      lastVisitMs: agg.lastVisitMs,
      matchedConditions: [...new Set(allMatched)],
    });
  }

  // Sort by total spend descending
  result.sort((a, b) => b.totalSpendCents - a.totalSpendCents);

  const summary = `Found ${result.length} customer${result.length !== 1 ? "s" : ""} matching your audience criteria.`;

  return {
    customers: result,
    total: result.length,
    queryMs: Date.now() - t0,
    summary,
  };
}
