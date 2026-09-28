//
// Server-only Clover POS data ingestion orchestration.
// Paginated fetch + normalize + idempotent upsert into Supabase.
// After ingestion, eligible paid orders are auto-synced to the CRM, and customer purchase mappings are processed.
// All secrets read inside functions via getIntegrationConfig().
import { getIntegrationConfig } from "./config.server";
import { getSupabaseServer } from "./supabase.server";
import { syncOrderToGhl } from "./sync.server";
import { processPendingPurchases } from "./purchase-ops.server";
import {
    rangeToMs,
    cloverDateFilter,
    type RangeLabel,
    type DateRange,
} from "./clover-dates.server";
import {
    upsertCustomer,
    upsertCategory,
    upsertProduct,
    upsertEmployee,
    upsertPayment,
    upsertRefund,
    upsertDiscount,
    upsertModifierGroup,
    upsertModifier,
    upsertOrderRecord,
    upsertOrderItemRecord,
    derivePaymentStatus,
} from "./pos-upserts.server";

class CloverApiError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
        super(`Clover API error ${status}: ${body.slice(0, 300)}`);
        this.name = "CloverApiError";
        this.status = status;
        this.body = body;
    }
}

async function cloverGet(path: string): Promise<any> {
    const cfg = getIntegrationConfig();
    const token = cfg.clover.apiKey.trim();
    let res = await fetch(`${cfg.clover.apiBase}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 401) {
        const sep = path.includes("?") ? "&" : "?";
        res = await fetch(
            `${cfg.clover.apiBase}${path}${sep}access_token=${encodeURIComponent(token)}`,
            { headers: { Accept: "application/json" } },
        );
    }
    const text = await res.text();
    if (!res.ok) throw new CloverApiError(res.status, text);
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

async function cloverPaginate(
    basePath: string,
    opts: { limit?: number; maxPages?: number; extraParams?: string } = {},
): Promise<{ elements: any[]; pages: number }> {
    const limit = opts.limit ?? 100;
    const maxPages = opts.maxPages ?? 50;
    const out: any[] = [];
    let offset = 0;
    let pages = 0;
    for (let page = 0; page < maxPages; page++) {
        const sep = basePath.includes("?") ? "&" : "?";
        const url = `${basePath}${sep}limit=${limit}&offset=${offset}${opts.extraParams ? `&${opts.extraParams}` : ""}`;
        const json = await cloverGet(url);
        const elements: any[] = json?.elements ?? [];
        out.push(...elements);
        pages += 1;
        if (elements.length < limit) break;
        offset += limit;
    }
    return { elements: out, pages };
}

// ---- Sync run record ---------------------------------------------------

export type SyncRunSummary = {
    runId: string;
    status: "completed" | "failed";
    merchantId: string;
    kind: string;
    rangeStart: number | null;
    rangeEnd: number | null;
    ordersFetched: number;
    ordersUpserted: number;
    orderItemsFetched: number;
    orderItemsUpserted: number;
    customersFetched: number;
    customersUpserted: number;
    paymentsFetched: number;
    paymentsUpserted: number;
    refundsFetched: number;
    productsFetched: number;
    productsUpserted: number;
    categoriesFetched: number;
    categoriesUpserted: number;
    employeesFetched: number;
    employeesUpserted: number;
    modifiersFetched: number;
    discountsFetched: number;
    crmOrdersSynced: number;
    crmOrdersHeld: number;
    crmOrdersErrors: number;
    crmContactsCreated: number;
    crmPurchaseRecordsCreated: number;
    errors: string[];
    startedAt: string;
    finishedAt: string | null;
};

async function createSyncRun(
    merchantId: string,
    kind: string,
    rangeStart?: number,
    rangeEnd?: number,
) {
    const sb = getSupabaseServer();
    const { data, error } = await sb
        .from("sync_runs")
        .insert({
            clover_merchant_id: merchantId,
            kind,
            status: "running",
            range_start: rangeStart ?? null,
            range_end: rangeEnd ?? null,
        })
        .select("*")
        .maybeSingle();
    if (error) throw new Error(`create sync_run: ${error.message}`);
    return data;
}

async function finishSyncRun(runId: string, patch: Record<string, any>) {
    const sb = getSupabaseServer();
    const { error } = await sb
        .from("sync_runs")
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq("id", runId);
    if (error) throw new Error(`finish sync_run: ${error.message}`);
}

// ---- Public: refresh POS data ------------------------------------------

export type RefreshOptions = {
    kind?: "incremental" | "full";
    range?: RangeLabel;
    startDate?: string;
    endDate?: string;
};

export async function refreshPosData(opts: RefreshOptions = {}): Promise<SyncRunSummary> {
    const cfg = getIntegrationConfig();
    const merchantId = cfg.clover.merchantId;
    const kind = opts.kind ?? "incremental";

    let range: DateRange;
    if (opts.startDate || opts.endDate) {
        const startMs = opts.startDate ? new Date(opts.startDate).getTime() : 0;
        const endMs = opts.endDate ? new Date(opts.endDate).getTime() : Date.now();
        range = { startMs, endMs, label: "all" };
    } else {
        range = rangeToMs(opts.range ?? "month");
    }

    const run = await createSyncRun(merchantId, kind, range.startMs, range.endMs);
    const runId = run.id;
    const errors: string[] = [];
    const counters = {
        ordersFetched: 0,
        ordersUpserted: 0,
        orderItemsFetched: 0,
        orderItemsUpserted: 0,
        customersFetched: 0,
        customersUpserted: 0,
        paymentsFetched: 0,
        paymentsUpserted: 0,
        refundsFetched: 0,
        productsFetched: 0,
        productsUpserted: 0,
        categoriesFetched: 0,
        categoriesUpserted: 0,
        employeesFetched: 0,
        employeesUpserted: 0,
        modifiersFetched: 0,
        discountsFetched: 0,
        crmOrdersSynced: 0,
        crmOrdersHeld: 0,
        crmOrdersErrors: 0,
        crmContactsCreated: 0,
        crmPurchaseRecordsCreated: 0,
    };

    const safe = async (label: string, fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (e: any) {
            errors.push(`${label}: ${e?.message ?? String(e)}`);
        }
    };

    const dateFilter = cloverDateFilter(range);

    // Reconciliation accumulator — mirrors Clover's own sales breakdown so we
    // can compare our result directly against the Clover dashboard.
    const recon = {
        rangeLabel: range.label,
        rangeStartMs: range.startMs,
        rangeEndMs: range.endMs,
        ordersFetched: 0,
        pagesFetched: 0,
        paymentsFetched: 0,
        refundsFetched: 0,
        voidsFetched: 0,
        grossSalesCents: 0,
        discountsCents: 0,
        taxesCents: 0,
        tipsCents: 0,
        serviceChargesCents: 0,
        refundAmountCents: 0,
        netSalesCents: 0,
        paidOrderCount: 0,
        itemsSold: 0,
    };
    const c = (v: any) =>
        v == null
            ? 0
            : typeof v === "number"
                ? v
                : Number.isFinite(Number(v))
                    ? Math.round(Number(v))
                    : 0;

    // 1. Categories
    await safe("categories", async () => {
        const { elements: cats } = await cloverPaginate(`/v3/merchants/${merchantId}/categories`);
        counters.categoriesFetched = cats.length;
        for (const cat of cats) await upsertCategory(merchantId, cat);
        counters.categoriesUpserted = cats.length;
    });

    const catNameMap = new Map<string, string>();
    await safe("category-names", async () => {
        const { elements: cats } = await cloverPaginate(`/v3/merchants/${merchantId}/categories`);
        for (const cat of cats) if (cat.id && cat.name) catNameMap.set(cat.id, cat.name);
    });

    // 2. Products
    await safe("products", async () => {
        const { elements: items } = await cloverPaginate(
            `/v3/merchants/${merchantId}/items?expand=categories`,
        );
        counters.productsFetched = items.length;
        for (const it of items) {
            const catId = it.categories?.elements?.[0]?.id;
            await upsertProduct(merchantId, it, catId ? (catNameMap.get(catId) ?? null) : null);
        }
        counters.productsUpserted = items.length;
    });

    // 3. Customers (expanded emailAddresses, phoneNumbers, addresses)
    await safe("customers", async () => {
        const { elements: customers } = await cloverPaginate(
            `/v3/merchants/${merchantId}/customers?expand=emailAddresses,phoneNumbers,addresses`,
        );
        counters.customersFetched = customers.length;
        for (const cust of customers) await upsertCustomer(merchantId, cust);
        counters.customersUpserted = customers.length;
    });

    // 4. Employees
    await safe("employees", async () => {
        const { elements: emps } = await cloverPaginate(`/v3/merchants/${merchantId}/employees`);
        counters.employeesFetched = emps.length;
        for (const e of emps) await upsertEmployee(merchantId, e);
        counters.employeesUpserted = emps.length;
    });

    // 5. Modifier groups + modifiers
    await safe("modifier-groups", async () => {
        const { elements: groups } = await cloverPaginate(
            `/v3/merchants/${merchantId}/modifier_groups`,
        );
        for (const g of groups) await upsertModifierGroup(merchantId, g);
    });
    await safe("modifiers", async () => {
        const { elements: mods } = await cloverPaginate(`/v3/merchants/${merchantId}/modifiers`);
        counters.modifiersFetched = mods.length;
        for (const m of mods) await upsertModifier(merchantId, m);
    });

    // 6. Discounts
    await safe("discounts", async () => {
        const { elements: discounts } = await cloverPaginate(`/v3/merchants/${merchantId}/discounts`);
        counters.discountsFetched = discounts.length;
        for (const d of discounts) await upsertDiscount(merchantId, d);
    });

    // 7. Orders — full expansion: lineItems + discounts + modifiers, payments +
    //    refunds, refunds, discounts, customers, serviceCharge, employee.
    await safe("orders", async () => {
        const orderPageOpts = { limit: 100, maxPages: 150, extraParams: "orderBy=createdTime+DESC" };
        let orders: any[] = [];
        let pages = 0;
        try {
            const r = await cloverPaginate(
                `/v3/merchants/${merchantId}/orders?expand=lineItems,lineItems.discounts,lineItems.modifiers,payments,payments.refunds,refunds,discounts,customers,serviceCharge,employee${dateFilter}`,
                orderPageOpts,
            );
            orders = r.elements;
            pages = r.pages;
        } catch {
            const r = await cloverPaginate(
                `/v3/merchants/${merchantId}/orders?expand=lineItems,payments,refunds,customers${dateFilter}`,
                orderPageOpts,
            );
            orders = r.elements;
            pages = r.pages;
        }
        counters.ordersFetched = orders.length;
        recon.ordersFetched = orders.length;
        recon.pagesFetched = pages;

        for (const order of orders) {
            try {
                const orderRow = await upsertOrderRecord(merchantId, order);
                counters.ordersUpserted += 1;
                const currency = order.currency ?? "USD";
                const payments: any[] = order.payments?.elements ?? order.payments ?? [];
                const refunds: any[] = order.refunds?.elements ?? order.refunds ?? [];
                const discounts: any[] = order.discounts?.elements ?? order.discounts ?? [];
                const lineItems: any[] = order.lineItems?.elements ?? order.lineItems ?? [];
                const paymentStatus = derivePaymentStatus(order, payments);
                const createdTime = typeof order.createdTime === "number" ? order.createdTime : 0;

                // ---- Reconciliation accumulation (per order) ----
                // Net sales = sum of line item totals (unit*qty + mods - line disc).
                const orderNetSales = lineItems.reduce((s, li) => {
                    const unit = c(li.price);
                    const qty = Number(li.quantity ?? 1) || 0;
                    const mods = (li.modifiers?.elements ?? li.modifiers ?? []).reduce(
                        (ms: number, m: any) => ms + c(m.amount ?? m.price),
                        0,
                    );
                    const disc = (li.discounts?.elements ?? li.discounts ?? []).reduce(
                        (ds: number, d: any) => ds + c(d.amount),
                        0,
                    );
                    return s + Math.max(0, unit * qty + mods - disc);
                }, 0);
                recon.netSalesCents += orderNetSales;
                recon.grossSalesCents += orderNetSales; // gross == net before order-level discounts
                recon.discountsCents += discounts.reduce((s, d) => s + c(d.amount), 0);
                recon.taxesCents +=
                    c(order.taxAmount) + lineItems.reduce((s, li) => s + c(li.taxAmount), 0);
                recon.serviceChargesCents += c(order.serviceCharge?.amount);
                recon.tipsCents += payments.reduce((s, p) => s + c(p.tipAmount), 0);
                recon.refundAmountCents += refunds.reduce((s, r) => s + c(r.amount), 0);
                recon.itemsSold += lineItems.reduce((s, li) => s + (Number(li.quantity ?? 1) || 0), 0);
                recon.paymentsFetched += payments.length;
                recon.refundsFetched += refunds.length;
                recon.voidsFetched += payments.filter((p) => p.result === "VOIDED").length;
                if (paymentStatus === "PAID") recon.paidOrderCount += 1;

                for (const li of lineItems) {
                    await upsertOrderItemRecord(
                        merchantId,
                        orderRow.id,
                        order.id,
                        li,
                        currency,
                        paymentStatus,
                        createdTime,
                    );
                    counters.orderItemsFetched += 1;
                    counters.orderItemsUpserted += 1;
                }
                for (const p of payments) {
                    await upsertPayment(merchantId, p);
                    counters.paymentsFetched += 1;
                    counters.paymentsUpserted += 1;
                }
                for (const r of refunds) {
                    await upsertRefund(merchantId, r);
                    counters.refundsFetched += 1;
                }
            } catch (e: any) {
                errors.push(`order ${order.id}: ${e?.message ?? String(e)}`);
            }
        }
    });

    // 8. Standalone payments
    await safe("payments", async () => {
        const { elements: payments } = await cloverPaginate(
            `/v3/merchants/${merchantId}/payments?expand=tender,cardTransaction${dateFilter}`,
            { limit: 100, maxPages: 20 },
        );
        for (const p of payments) {
            try {
                await upsertPayment(merchantId, p);
            } catch (e: any) {
                errors.push(`payment ${p.id}: ${e?.message ?? String(e)}`);
            }
        }
        counters.paymentsFetched = Math.max(counters.paymentsFetched, payments.length);
        counters.paymentsUpserted = Math.max(counters.paymentsUpserted, payments.length);
    });

    // 9. Standalone refunds
    await safe("refunds", async () => {
        try {
            const { elements: refunds } = await cloverPaginate(
                `/v3/merchants/${merchantId}/refunds${dateFilter}`,
                { limit: 100, maxPages: 20 },
            );
            for (const r of refunds) {
                try {
                    await upsertRefund(merchantId, r);
                } catch (e: any) {
                    errors.push(`refund ${r.id}: ${e?.message ?? String(e)}`);
                }
            }
            counters.refundsFetched = Math.max(counters.refundsFetched, refunds.length);
        } catch {
            /* /refunds may be unavailable on some plans */
        }
    });

    // 10. Auto-sync eligible paid orders to the CRM (purchase records + tags).
    // Processes orders that are PAID and not yet processed (or previously errored).
    // Failure-isolated: one bad order never stops the rest.
    await safe("crm-sync", async () => {
        const sb = getSupabaseServer();
        const { data: eligible, error: eErr } = await sb
            .from("orders")
            .select("clover_order_id")
            .eq("payment_status", "PAID")
            .or(
                "sync_status.is.null,sync_status.eq.pending,sync_status.eq.error,status.in.(pending,error)",
            )
            .order("created_time", { ascending: false })
            .limit(250);
        if (eErr) throw new Error(`fetch eligible for sync: ${eErr.message}`);
        for (const o of eligible ?? []) {
            try {
                const result = await syncOrderToGhl(o.clover_order_id);
                if (result.outcome === "synced" || result.outcome === "partial") {
                    counters.crmOrdersSynced += 1;
                    counters.crmPurchaseRecordsCreated += result.itemsSynced;
                    // A confident match resolved an existing GHL contact (we never create).
                    if (result.ghlContactId) counters.crmContactsCreated += 1;
                } else if (result.outcome === "held_for_review") {
                    counters.crmOrdersHeld += 1;
                } else if (result.outcome === "error") {
                    counters.crmOrdersErrors += 1;
                    errors.push(`crm-sync ${o.clover_order_id}: ${result.error ?? result.message}`);
                }
            } catch (e: any) {
                counters.crmOrdersErrors += 1;
                errors.push(`crm-sync ${o.clover_order_id}: ${e?.message ?? String(e)}`);
            }
        }
    });

    // 11. Run customer purchase mapping & tag pipeline for all customers with purchases.
    await safe("customer-purchase-mapping", async () => {
        await processPendingPurchases(300);
    });

    const status: "completed" | "failed" =
        errors.length > 0 && counters.ordersUpserted === 0 ? "failed" : "completed";

    await finishSyncRun(runId, { status, ...counters, errors: JSON.stringify(errors) });

    return {
        runId,
        status,
        merchantId,
        kind,
        rangeStart: range.startMs ?? null,
        rangeEnd: range.endMs ?? null,
        ...counters,
        errors,
        startedAt: run.started_at,
        finishedAt: new Date().toISOString(),
        reconciliation: recon,
    };
}

// ---- Last sync run lookup ----------------------------------------------

export async function getLastSyncRun(): Promise<{
    runId: string | null;
    status: string | null;
    kind: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    ordersUpserted: number;
    customersUpserted: number;
    paymentsUpserted: number;
    productsUpserted: number;
} | null> {
    const sb = getSupabaseServer();
    const { data, error } = await sb
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return {
        runId: data.id,
        status: data.status,
        kind: data.kind,
        startedAt: data.started_at,
        finishedAt: data.finished_at,
        ordersUpserted: data.orders_upserted ?? 0,
        customersUpserted: data.customers_upserted ?? 0,
        paymentsUpserted: data.payments_upserted ?? 0,
        productsUpserted: data.products_upserted ?? 0,
    };
}
