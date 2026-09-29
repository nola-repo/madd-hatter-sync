//
// Server-only POS data queries for the dashboard / list pages.
// All logic lives here; .functions.ts wrappers stay thin.
// This is the CANONICAL data layer — every page consumes these queries so
// there is ONE consistent source of truth derived from the normalized
// Supabase tables. Sales are always computed from net_sales_cents (line-item
// derived, matching Clover's "Net Sales"), never from order.total alone.
import { getSupabaseServer } from "./supabase.server";
import { rangeToMs, type RangeLabel } from "./clover-dates.server";
import { deriveSyncStatus } from "./format";
import type { OrderRow, OrderItemRow, CustomerMappingRow } from "./supabase.server";
import type {
    DashboardStats,
    OrderListItem,
    OrderItemListRow,
    CustomerListItem,
    ProductListItem,
    ListResult,
    TransactionRow,
    ProductRow,
    CategoryRow,
    EmployeeRow,
    CustomerDetailRow,
    OrderDetailRow,
} from "./types";

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

function mapItem(i: OrderItemRow): OrderItemListRow {
    return {
        id: i.id,
        orderId: i.order_id,
        cloverLineItemId: i.clover_line_item_id,
        cloverItemId: i.clover_item_id,
        purchaseReference: i.purchase_reference,
        itemName: i.item_name,
        category: i.category,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
        lineTotalCents: i.line_total_cents,
        currency: i.currency,
        paymentStatus: i.payment_status,
        status: i.status,
        flag: i.flag,
    };
}

// ---- Dashboard aggregation --------------------------------------------

export async function getDashboardStats(opts?: {
    range?: "today" | "week" | "month" | "all";
}): Promise<DashboardStats> {
    const sb = getSupabaseServer();
    const activeRange = opts?.range ?? "month";

    // Use the SAME canonical date-range utility as the ingestion layer so the
    // dashboard aggregation and the Clover API fetch always agree on boundaries.
    // This uses the merchant timezone (CLOVER_TIMEZONE, default America/New_York).
    const range = rangeToMs(activeRange as RangeLabel);

    // Fetch orders in the selected range using DB-side filtering on
    // created_time (Clover epoch ms). This avoids loading all orders into memory.
    let rangeOrdersQ = sb
        .from("orders")
        .select("*")
        .gte("created_time", range.startMs)
        .lte("created_time", range.endMs)
        .order("created_time", { ascending: false });
    if (range.startMs > 0) {
        // already applied; for "all" startMs is 0 which matches everything
    }
    const { data: rangeOrders, error: roErr } = await rangeOrdersQ.limit(100000);
    if (roErr) throw new Error(`DB range orders: ${roErr.message}`);
    const targetOrders = (rangeOrders ?? []) as OrderRow[];

    // Fetch ALL orders (no date filter) for the "all-time" totals cards.
    const { data: allOrders, error: oErr } = await sb
        .from("orders")
        .select("*")
        .order("created_time", { ascending: false })
        .limit(100000);
    if (oErr) throw new Error(`DB orders: ${oErr.message}`);
    const orderRows = (allOrders ?? []) as OrderRow[];

    // Fetch order items for the selected range (via the orders in range).
    const rangeOrderIds = new Set(targetOrders.map((o) => o.id));
    const { data: allItems, error: iErr } = await sb.from("order_items").select("*").limit(100000);
    if (iErr) throw new Error(`DB items: ${iErr.message}`);
    const itemRows = (allItems ?? []) as OrderItemRow[];
    const targetItems = itemRows.filter((i) => i.order_id && rangeOrderIds.has(i.order_id));

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
    const totalItemsSold = itemRows.reduce((s, i) => s + (i.quantity || 0), 0);

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

    // Top items by quantity in target range
    const itemAgg = new Map<
        string,
        { name: string; category: string | null; qty: number; revenue: number }
    >();
    for (const it of targetItems) {
        const key = it.item_name;
        const e = itemAgg.get(key) ?? { name: key, category: it.category, qty: 0, revenue: 0 };
        e.qty += it.quantity || 0;
        e.revenue += it.line_total_cents || 0;
        itemAgg.set(key, e);
    }
    const topItems = [...itemAgg.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 6)
        .map((e) => ({ name: e.name, category: e.category, quantity: e.qty, revenueCents: e.revenue }));

    // Top categories by revenue in target range
    const catAgg = new Map<string, number>();
    for (const it of targetItems) {
        const k = it.category || "Uncategorized";
        catAgg.set(k, (catAgg.get(k) || 0) + (it.line_total_cents || 0));
    }
    const topCategories = [...catAgg.entries()]
        .map(([name, revenueCents]) => ({ name, revenueCents }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 6);

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

// ---- Orders list -------------------------------------------------------

export async function listOrders(opts: {
    search?: string;
    paymentStatus?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<OrderListItem>> {
    const sb = getSupabaseServer();
    let q = sb.from("orders").select("*", { count: "exact" });
    if (opts.paymentStatus && opts.paymentStatus !== "all") {
        q = q.eq("payment_status", opts.paymentStatus);
    }
    if (opts.search) {
        const s = opts.search.replace(/[%_]/g, (m) => "\\" + m);
        q = q.ilike("clover_order_id", `%${s}%`);
    }
    q = q
        .order("created_time", { ascending: false })
        .range(opts.offset, opts.offset + opts.limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(`DB list orders: ${error.message}`);
    return { rows: (data ?? []).map(mapOrder), total: count ?? 0 };
}

// ---- Order items list -------------------------------------------------

export async function listOrderItems(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<OrderItemListRow>> {
    const sb = getSupabaseServer();
    let q = sb.from("order_items").select("*", { count: "exact" });
    if (opts.search) {
        const s = opts.search.replace(/[%_]/g, (m) => "\\" + m);
        q = q.or(`item_name.ilike.%${s}%,purchase_reference.ilike.%${s}%`);
    }
    q = q.order("created_at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(`DB list items: ${error.message}`);
    return { rows: (data ?? []).map(mapItem), total: count ?? 0 };
}

// ---- Customers list (aggregated) --------------------------------------

export async function listCustomers(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<CustomerListItem>> {
    const sb = getSupabaseServer();
    const { data: orders, error: oErr } = await sb.from("orders").select("*").limit(20000);
    if (oErr) throw new Error(`DB customers orders: ${oErr.message}`);
    const { data: mappings, error: mErr } = await sb.from("customer_mappings").select("*");
    if (mErr) throw new Error(`DB mappings: ${mErr.message}`);

    const mapByClover = new Map<string, CustomerMappingRow>();
    for (const m of (mappings ?? []) as CustomerMappingRow[]) {
        mapByClover.set(m.clover_customer_id, m);
    }

    const agg = new Map<
        string,
        {
            cloverCustomerId: string;
            ghlContactId: string | null;
            matchedBy: string | null;
            orderCount: number;
            totalSpendCents: number;
            lastVisitMs: number;
        }
    >();
    for (const o of (orders ?? []) as OrderRow[]) {
        if (!o.clover_customer_id) continue;
        const m = mapByClover.get(o.clover_customer_id);
        const e = agg.get(o.clover_customer_id) ?? {
            cloverCustomerId: o.clover_customer_id,
            ghlContactId: m?.ghl_contact_id ?? null,
            matchedBy: m?.matched_by ?? null,
            orderCount: 0,
            totalSpendCents: 0,
            lastVisitMs: 0,
        };
        e.orderCount += 1;
        e.totalSpendCents += o.net_sales_cents ?? o.net_total_cents ?? o.total_cents ?? 0;
        e.lastVisitMs = Math.max(e.lastVisitMs, o.created_time || 0);
        agg.set(o.clover_customer_id, e);
    }

    let rows = [...agg.values()];
    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter(
            (r) =>
                r.cloverCustomerId.toLowerCase().includes(s) ||
                (r.ghlContactId ?? "").toLowerCase().includes(s),
        );
    }
    rows.sort((a, b) => b.lastVisitMs - a.lastVisitMs);
    const total = rows.length;
    const paged = rows.slice(opts.offset, opts.offset + opts.limit);
    return { rows: paged, total };
}

// ---- Products list (aggregated) ---------------------------------------

export async function listProducts(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<ProductListItem>> {
    const sb = getSupabaseServer();
    const { data: items, error } = await sb.from("order_items").select("*").limit(50000);
    if (error) throw new Error(`DB products: ${error.message}`);
    const itemRows = (items ?? []) as OrderItemRow[];

    const agg = new Map<
        string,
        {
            cloverItemId: string | null;
            name: string;
            category: string | null;
            priceCents: number;
            qtySold: number;
            revenue: number;
            orderCount: number;
        }
    >();
    for (const it of itemRows) {
        const key = it.clover_item_id ?? it.item_name;
        const e = agg.get(key) ?? {
            cloverItemId: it.clover_item_id,
            name: it.item_name,
            category: it.category,
            priceCents: it.unit_price_cents,
            qtySold: 0,
            revenue: 0,
            orderCount: 0,
        };
        e.qtySold += it.quantity || 0;
        e.revenue += it.line_total_cents || 0;
        e.orderCount += 1;
        agg.set(key, e);
    }

    let rows = [...agg.values()];
    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter(
            (r) => r.name.toLowerCase().includes(s) || (r.category ?? "").toLowerCase().includes(s),
        );
    }
    rows.sort((a, b) => b.revenue - a.revenue);
    const total = rows.length;
    const paged = rows.slice(opts.offset, opts.offset + opts.limit);
    return {
        rows: paged.map((e) => ({
            cloverItemId: e.cloverItemId,
            name: e.name,
            category: e.category,
            priceCents: e.priceCents,
            quantitySold: e.qtySold,
            revenueCents: e.revenue,
            orderCount: e.orderCount,
        })),
        total,
    };
}

// ---- Transactions (payments) -------------------------------------------

export async function listTransactions(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<TransactionRow>> {
    const sb = getSupabaseServer();
    let q = sb.from("payments").select("*", { count: "exact" });
    if (opts.search) {
        const s = opts.search.replace(/[%_]/g, (m) => "\\" + m);
        q = q.or(`clover_payment_id.ilike.%${s}%,clover_order_id.ilike.%${s}%`);
    }
    q = q
        .order("created_time", { ascending: false })
        .range(opts.offset, opts.offset + opts.limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(`DB transactions: ${error.message}`);
    const rows = (data ?? []).map((p: any) => ({
        cloverPaymentId: p.clover_payment_id,
        cloverOrderId: p.clover_order_id,
        date: p.created_time ?? 0,
        amountCents: p.amount_cents ?? 0,
        tipCents: p.tip_amount_cents ?? 0,
        taxCents: p.tax_amount_cents ?? 0,
        paymentType: p.payment_type,
        result: p.result,
        cardType: p.card_type,
        currency: p.currency ?? "USD",
        cloverEmployeeId: p.clover_employee_id,
    }));
    return { rows, total: count ?? 0 };
}

// ---- Products from inventory table -------------------------------------

export async function listInventoryProducts(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<ProductRow>> {
    const sb = getSupabaseServer();
    // Fetch products + aggregate sales from order_items in one pass.
    const { data: prods, error: pErr } = await sb.from("products").select("*").limit(5000);
    if (pErr) throw new Error(`DB products: ${pErr.message}`);
    const { data: items, error: iErr } = await sb.from("order_items").select("*").limit(50000);
    if (iErr) throw new Error(`DB items: ${iErr.message}`);

    const agg = new Map<string, { qtySold: number; revenue: number; orderCount: number }>();
    for (const it of (items ?? []) as OrderItemRow[]) {
        const key = it.clover_item_id ?? it.item_name;
        const e = agg.get(key) ?? { qtySold: 0, revenue: 0, orderCount: 0 };
        e.qtySold += it.quantity || 0;
        e.revenue += it.line_total_cents || 0;
        e.orderCount += 1;
        agg.set(key, e);
    }

    let rows = ((prods ?? []) as any[]).map((p) => {
        const a = agg.get(p.clover_item_id) ?? { qtySold: 0, revenue: 0, orderCount: 0 };
        return {
            cloverItemId: p.clover_item_id,
            name: p.name ?? "Unnamed",
            category: p.category_name ?? null,
            sku: p.sku ?? null,
            priceCents: p.price_cents ?? 0,
            quantitySold: a.qtySold,
            revenueCents: a.revenue,
            orderCount: a.orderCount,
        };
    });

    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter(
            (r) =>
                r.name.toLowerCase().includes(s) ||
                (r.category ?? "").toLowerCase().includes(s) ||
                (r.sku ?? "").toLowerCase().includes(s),
        );
    }
    rows.sort((a, b) => b.revenueCents - a.revenueCents);
    const total = rows.length;
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total };
}

// ---- Categories --------------------------------------------------------

export async function listCategories(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<CategoryRow>> {
    const sb = getSupabaseServer();
    const { data: cats, error: cErr } = await sb.from("categories").select("*").limit(2000);
    if (cErr) throw new Error(`DB categories: ${cErr.message}`);
    const { data: prods, error: pErr } = await sb.from("products").select("*").limit(5000);
    if (pErr) throw new Error(`DB products: ${pErr.message}`);
    const { data: items, error: iErr } = await sb.from("order_items").select("*").limit(50000);
    if (iErr) throw new Error(`DB items: ${iErr.message}`);

    const itemCount = new Map<string, number>();
    for (const p of (prods ?? []) as any[]) {
        if (p.clover_category_id)
            itemCount.set(p.clover_category_id, (itemCount.get(p.clover_category_id) ?? 0) + 1);
    }
    const sales = new Map<string, { qty: number; rev: number }>();
    for (const it of (items ?? []) as OrderItemRow[]) {
        const cat = it.category ?? "Uncategorized";
        const e = sales.get(cat) ?? { qty: 0, rev: 0 };
        e.qty += it.quantity || 0;
        e.rev += it.line_total_cents || 0;
        sales.set(cat, e);
    }

    let rows = ((cats ?? []) as any[]).map((c) => {
        const s = sales.get(c.name) ?? { qty: 0, rev: 0 };
        return {
            cloverCategoryId: c.clover_category_id,
            name: c.name ?? "Uncategorized",
            itemCount: itemCount.get(c.clover_category_id) ?? 0,
            quantitySold: s.qty,
            revenueCents: s.rev,
        };
    });
    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(s));
    }
    rows.sort((a, b) => b.revenueCents - a.revenueCents);
    const total = rows.length;
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total };
}

// ---- Employees ---------------------------------------------------------

export async function listEmployees(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<EmployeeRow>> {
    const sb = getSupabaseServer();
    const { data: emps, error: eErr } = await sb.from("employees").select("*").limit(2000);
    if (eErr) throw new Error(`DB employees: ${eErr.message}`);
    const { data: orders, error: oErr } = await sb.from("orders").select("*").limit(20000);
    if (oErr) throw new Error(`DB orders: ${oErr.message}`);

    const agg = new Map<string, { orderCount: number; sales: number }>();
    for (const o of (orders ?? []) as any[]) {
        if (!o.clover_employee_id) continue;
        const e = agg.get(o.clover_employee_id) ?? { orderCount: 0, sales: 0 };
        e.orderCount += 1;
        e.sales += o.net_sales_cents ?? o.net_total_cents ?? o.total_cents ?? 0;
        agg.set(o.clover_employee_id, e);
    }

    let rows = ((emps ?? []) as any[]).map((e) => {
        const a = agg.get(e.clover_employee_id) ?? { orderCount: 0, sales: 0 };
        return {
            cloverEmployeeId: e.clover_employee_id,
            name: e.name ?? "Unknown",
            orderCount: a.orderCount,
            salesCents: a.sales,
        };
    });
    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(s));
    }
    rows.sort((a, b) => b.salesCents - a.salesCents);
    const total = rows.length;
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total };
}

// ---- Customer detail (with real customer info) -------------------------

export async function listCustomerDetails(opts: {
    search?: string;
    limit: number;
    offset: number;
}): Promise<ListResult<CustomerDetailRow>> {
    const sb = getSupabaseServer();
    const { data: customers, error: cErr } = await sb.from("customers").select("*").limit(20000);
    if (cErr) throw new Error(`DB customers: ${cErr.message}`);
    const { data: orders, error: oErr } = await sb.from("orders").select("*").limit(50000);
    if (oErr) throw new Error(`DB orders: ${oErr.message}`);
    const { data: mappings, error: mErr } = await sb.from("customer_mappings").select("*");
    if (mErr) throw new Error(`DB mappings: ${mErr.message}`);

    const mapByClover = new Map<string, CustomerMappingRow>();
    for (const m of (mappings ?? []) as CustomerMappingRow[])
        mapByClover.set(m.clover_customer_id, m);

    const agg = new Map<string, { orderCount: number; totalSpend: number; lastVisit: number }>();
    for (const o of (orders ?? []) as OrderRow[]) {
        if (!o.clover_customer_id) continue;
        const e = agg.get(o.clover_customer_id) ?? { orderCount: 0, totalSpend: 0, lastVisit: 0 };
        e.orderCount += 1;
        e.totalSpend += o.net_sales_cents ?? o.net_total_cents ?? o.total_cents ?? 0;
        e.lastVisit = Math.max(e.lastVisit, o.created_time || 0);
        agg.set(o.clover_customer_id, e);
    }

    let rows = ((customers ?? []) as any[]).map((c) => {
        const a = agg.get(c.clover_customer_id) ?? { orderCount: 0, totalSpend: 0, lastVisit: 0 };
        const m = mapByClover.get(c.clover_customer_id);
        const matchStatus = m ? "MATCHED" : a.orderCount > 0 ? "UNMATCHED" : "UNMATCHED";
        return {
            cloverCustomerId: c.clover_customer_id,
            firstName: c.first_name ?? null,
            lastName: c.last_name ?? null,
            email: c.email ?? null,
            phone: c.phone ?? null,
            orderCount: a.orderCount,
            totalSpendCents: a.totalSpend,
            averageOrderCents: a.orderCount ? Math.round(a.totalSpend / a.orderCount) : 0,
            lastVisitMs: a.lastVisit,
            ghlContactId: m?.ghl_contact_id ?? null,
            matchedBy: m?.matched_by ?? null,
            matchStatus,
        };
    });

    if (opts.search) {
        const s = opts.search.toLowerCase();
        rows = rows.filter(
            (r) =>
                r.cloverCustomerId.toLowerCase().includes(s) ||
                (r.firstName ?? "").toLowerCase().includes(s) ||
                (r.lastName ?? "").toLowerCase().includes(s) ||
                (r.email ?? "").toLowerCase().includes(s) ||
                (r.phone ?? "").toLowerCase().includes(s) ||
                (r.ghlContactId ?? "").toLowerCase().includes(s),
        );
    }
    rows.sort((a, b) => b.totalSpendCents - a.totalSpendCents);
    const total = rows.length;
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total };
}

// ---- Order detail ------------------------------------------------------

export async function getOrderDetail(orderId: string): Promise<OrderDetailRow | null> {
    const sb = getSupabaseServer();
    const { data: order, error: oErr } = await sb
        .from("orders")
        .select("*")
        .eq("clover_order_id", orderId)
        .maybeSingle();
    if (oErr) throw new Error(`DB order: ${oErr.message}`);
    if (!order) return null;

    const { data: items, error: iErr } = await sb
        .from("order_items")
        .select("*")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });
    if (iErr) throw new Error(`DB order items: ${iErr.message}`);

    return {
        id: order.id,
        cloverOrderId: order.clover_order_id,
        cloverCustomerId: order.clover_customer_id,
        cloverEmployeeId: order.clover_employee_id,
        orderType: order.order_type,
        status: order.status,
        paymentStatus: order.payment_status,
        currency: order.currency,
        createdTime: order.created_time ?? 0,
        modifiedTime: order.modified_time ?? null,
        subtotalCents: order.subtotal_cents ?? 0,
        discountTotalCents: order.discount_total_cents ?? 0,
        taxTotalCents: order.tax_total_cents ?? 0,
        serviceChargeCents: order.service_charge_cents ?? 0,
        tipCents: order.tip_cents ?? 0,
        totalCents: order.total_cents ?? 0,
        totalRefundedCents: order.total_refunded_cents ?? 0,
        locationName: order.location_name,
        items: ((items ?? []) as any[]).map((it) => ({
            cloverLineItemId: it.clover_line_item_id,
            cloverItemId: it.clover_item_id,
            itemName: it.item_name,
            category: it.category,
            quantity: it.quantity,
            unitPriceCents: it.unit_price_cents,
            lineTotalCents: it.line_total_cents,
            modifiers: it.modifiers_json,
            discounts: it.discounts_json,
        })),
    };
}

// ---- Customer Purchases with item breakdown ----------------------------

export type CustomerPurchaseRow = {
    cloverCustomerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    ghlContactId: string | null;
    matchStatus: string;
    matchMethod: string | null;
    orderCount: number;
    totalSpendCents: number;
    lastVisitMs: number;
    itemsPurchased: Array<{ name: string; qty: number; category: string | null }>;
};

export async function listCustomersWithPurchases(opts: {
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<{ rows: CustomerPurchaseRow[]; total: number }> {
    const sb = getSupabaseServer();
    const limit = opts.limit ?? 25;
    const offset = opts.offset ?? 0;

    // 1. Get all distinct customer IDs from orders
    const { data: orderRows } = await sb
        .from("orders")
        .select("clover_customer_id, clover_order_id, id, total_cents, created_time, net_sales_cents")
        .not("clover_customer_id", "is", null)
        .limit(10000);

    // Aggregate per customer
    const custAgg = new Map<string, { orderIds: string[]; totalCents: number; lastVisitMs: number }>();
    for (const o of orderRows ?? []) {
        const cid = o.clover_customer_id as string;
        const existing = custAgg.get(cid) ?? { orderIds: [], totalCents: 0, lastVisitMs: 0 };
        existing.orderIds.push(o.id);
        existing.totalCents += o.net_sales_cents ?? o.total_cents ?? 0;
        const ts = typeof o.created_time === "number" ? o.created_time : 0;
        if (ts > existing.lastVisitMs) existing.lastVisitMs = ts;
        custAgg.set(cid, existing);
    }

    let customerIds = [...custAgg.keys()];

    // 2. Load customer profiles
    const { data: customers } = await sb
        .from("customers")
        .select("clover_customer_id, first_name, last_name, email, phone")
        .in("clover_customer_id", customerIds)
        .limit(10000);

    const custMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));

    // 3. Apply search filter
    if (opts.search?.trim()) {
        const q = opts.search.trim().toLowerCase();
        customerIds = customerIds.filter((cid) => {
            const c = custMap.get(cid);
            const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase() : "";
            const email = (c?.email ?? "").toLowerCase();
            const phone = (c?.phone ?? "").toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q) || cid.includes(q);
        });
    }

    const total = customerIds.length;

    // 4. Page the customer list
    const pagedIds = customerIds.slice(offset, offset + limit);
    if (pagedIds.length === 0) return { rows: [], total };

    // 5. Load CRM mappings
    const { data: mappings } = await sb
        .from("customer_mappings")
        .select("clover_customer_id, ghl_contact_id, match_method, matched_by")
        .in("clover_customer_id", pagedIds);
    const mappingMap = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id, m]));

    // 6. Load all order items for paged customers' orders in one batch query
    const allOrderIds = pagedIds.flatMap((cid) => custAgg.get(cid)?.orderIds ?? []);
    const { data: items } = allOrderIds.length > 0
        ? await sb
            .from("order_items")
            .select("order_id, item_name, category, quantity")
            .in("order_id", allOrderIds)
        : { data: [] };

    // Group items by order_id → then by customer via the order lookup
    const orderOwnerMap = new Map<string, string>(); // orderId → cloverCustomerId
    for (const [cid, agg] of custAgg.entries()) {
        for (const oid of agg.orderIds) orderOwnerMap.set(oid, cid);
    }
    const custItemsMap = new Map<string, Map<string, { qty: number; category: string | null }>>();
    for (const item of items ?? []) {
        const cid = orderOwnerMap.get(item.order_id);
        if (!cid) continue;
        if (!custItemsMap.has(cid)) custItemsMap.set(cid, new Map());
        const itemMap = custItemsMap.get(cid)!;
        const normName = (item.item_name ?? "").trim();
        if (!normName) continue;
        const existing = itemMap.get(normName) ?? { qty: 0, category: item.category ?? null };
        existing.qty += item.quantity ?? 1;
        itemMap.set(normName, existing);
    }

    // 7. Assemble rows
    const rows: CustomerPurchaseRow[] = pagedIds.map((cid) => {
        const cust = custMap.get(cid);
        const mapping = mappingMap.get(cid);
        const agg = custAgg.get(cid)!;
        const itemMap = custItemsMap.get(cid) ?? new Map();
        const matchStatus = mapping
            ? "MATCHED"
            : cust?.email || cust?.phone
              ? "NO_GHL_MATCH"
              : "NO_IDENTIFIERS";
        return {
            cloverCustomerId: cid,
            customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") || "Clover Customer" : "Unknown",
            email: cust?.email ?? null,
            phone: cust?.phone ?? null,
            ghlContactId: mapping?.ghl_contact_id ?? null,
            matchStatus,
            matchMethod: mapping?.match_method ?? mapping?.matched_by ?? null,
            orderCount: agg.orderIds.length,
            totalSpendCents: agg.totalCents,
            lastVisitMs: agg.lastVisitMs,
            itemsPurchased: [...itemMap.entries()]
                .map(([name, { qty, category }]) => ({ name, qty, category }))
                .sort((a, b) => b.qty - a.qty),
        };
    });

    return { rows, total };
}
