//
// Server-only Clover POS data ingestion orchestration.
// Paginated fetch + normalize + idempotent upsert into Supabase.
// After ingestion, eligible paid orders are auto-synced to the CRM, and customer purchase mappings are processed.
// All secrets read inside functions via getIntegrationConfig().
import { getIntegrationConfig } from "./config.server";
import { getSupabaseServer } from "./supabase.server";
import { syncOrderToGhl } from "./sync.server";
import { processPendingPurchases } from "./purchase-ops.server";
import { findPurchaseObjectSchema, validatePurchaseSchema } from "./ghl.server";

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

/**
 * Rate-limit guard for CRM (GHL V2) upsert/record calls. The CRM enforces
 * ~100 requests / 10 seconds per location. On HTTP 429, this wrapper backs
 * off with exponential delay, logs the throttle to match_audit_log, then
 * retries — instead of crashing the batch or dropping the contact.
 *
 * `label` is used only for logging context. Returns the wrapped result on
 * success; throws the original error only after all retries are exhausted.
 */
async function logCrmThrottle(label: string, attempt: number, delayMs: number): Promise<void> {
  try {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();
    await sb.from("match_audit_log").insert({
      clover_merchant_id: cfg.clover.merchantId,
      clover_customer_id: `rate-limit:${label}`,
      match_status: "GHL_RATE_LIMITED",
      match_method: "none",
      match_evidence: { label, attempt, delayMs },
      error_code: "429",
      error_message: `CRM rate limit hit during "${label}". Backing off ${delayMs}ms (attempt ${attempt}).`,
    });
  } catch {
    // Logging must never break the pipeline.
  }
  console.warn(
    `[crm-rate-limit] ${label} throttled (429) — backoff ${delayMs}ms, attempt ${attempt}`,
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
  const row: Record<string, any> = {
    finished_at: new Date().toISOString(),
  };

  if (patch.status !== undefined) row.status = patch.status;
  if (patch.errors !== undefined) row.errors = patch.errors;
  if (patch.ordersFetched !== undefined) row.orders_fetched = patch.ordersFetched;
  if (patch.ordersUpserted !== undefined) row.orders_upserted = patch.ordersUpserted;
  if (patch.orderItemsFetched !== undefined) row.order_items_fetched = patch.orderItemsFetched;
  if (patch.orderItemsUpserted !== undefined) row.order_items_upserted = patch.orderItemsUpserted;
  if (patch.customersFetched !== undefined) row.customers_fetched = patch.customersFetched;
  if (patch.customersUpserted !== undefined) row.customers_upserted = patch.customersUpserted;
  if (patch.paymentsFetched !== undefined) row.payments_fetched = patch.paymentsFetched;
  if (patch.paymentsUpserted !== undefined) row.payments_upserted = patch.paymentsUpserted;
  if (patch.productsFetched !== undefined) row.products_fetched = patch.productsFetched;
  if (patch.productsUpserted !== undefined) row.products_upserted = patch.productsUpserted;
  if (patch.categoriesFetched !== undefined) row.categories_fetched = patch.categoriesFetched;
  if (patch.categoriesUpserted !== undefined) row.categories_upserted = patch.categoriesUpserted;
  if (patch.employeesFetched !== undefined) row.employees_fetched = patch.employeesFetched;
  if (patch.employeesUpserted !== undefined) row.employees_upserted = patch.employeesUpserted;
  if (patch.modifiersFetched !== undefined) row.modifiers_fetched = patch.modifiersFetched;
  if (patch.discountsFetched !== undefined) row.discounts_fetched = patch.discountsFetched;
  if (patch.crmOrdersSynced !== undefined) row.crm_orders_synced = patch.crmOrdersSynced;
  if (patch.crmOrdersHeld !== undefined) row.crm_orders_held = patch.crmOrdersHeld;
  if (patch.crmOrdersErrors !== undefined) row.crm_orders_errors = patch.crmOrdersErrors;
  if (patch.crmContactsCreated !== undefined) row.crm_contacts_created = patch.crmContactsCreated;
  if (patch.crmPurchaseRecordsCreated !== undefined) row.crm_purchase_records_created = patch.crmPurchaseRecordsCreated;

  const { error } = await sb.from("sync_runs").update(row).eq("id", runId);
  if (error) {
    console.warn(`[sync_runs] Failed to update run ${runId}:`, error.message);
  }
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

  // For incremental syncs (such as routine 15-minute cron triggers),
  // skip static catalog data (categories, products, employees, modifiers, discounts)
  // to finish in 2-4 seconds and stay far below the 30s ceiling.
  // Full catalog is pulled on kind === "full".
  if (kind === "full") {
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
  }

  // 7. Orders — full expansion: lineItems + discounts + modifiers, payments +
  //    refunds, refunds, discounts, customers, serviceCharge, employee.
  await safe("orders", async () => {
    // In cron/batch mode, cap to a tight number of pages (e.g. 1-2 pages = 100-200 orders)
    // so the Clover API calls finish in ~2-3 seconds well below the 30s timeout.
    // `range` is a DateRange object; compare its label, not the object itself.
    const maxOrderPages = kind === "incremental" ? (range.label === "today" ? 2 : 4) : 150;
    const orderPageOpts = {
      limit: 100,
      maxPages: maxOrderPages,
      extraParams: "orderBy=createdTime+DESC",
    };
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

  // 8. Standalone payments (for incremental sync, cap to 1 page to save time)
  await safe("payments", async () => {
    const { elements: payments } = await cloverPaginate(
      `/v3/merchants/${merchantId}/payments?expand=tender,cardTransaction${dateFilter}`,
      { limit: 100, maxPages: kind === "incremental" ? 1 : 20 },
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

  // 9. Standalone refunds (for incremental sync, cap to 1 page)
  await safe("refunds", async () => {
    try {
      const { elements: refunds } = await cloverPaginate(
        `/v3/merchants/${merchantId}/refunds${dateFilter}`,
        { limit: 100, maxPages: kind === "incremental" ? 1 : 20 },
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

  const status: "completed" | "failed" =
    errors.some((e) => e.startsWith("orders:")) && counters.ordersUpserted === 0
      ? "failed"
      : "completed";

  // NOTE: CRM sync (purchase records + tags) is intentionally NOT run inside
  // refreshPosData. It is split into runCrmSync() below so the cron pipeline
  // can run fetch (Clover → Supabase) and push (Supabase → CRM) as separate
  // 30-second-budget requests.

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

// ---- Standalone CRM sync (Supabase → GHL) ------------------------------
// Split out of refreshPosData so the cron pipeline can run Clover ingestion
// (step=fetch) and CRM push (step=push) as separate requests, each within
// the 30-second cron-job.org timeout budget.
//
//   1. Pre-fetch the GHL custom object schema ONCE (avoids 5 probes/order).
//   2. Sync eligible PAID orders (purchase records + associations).
//   3. Run customer purchase mapping & tag pipeline.
//
// `limit` caps the number of orders processed per call so a single cron tick
// stays well under 30s. cron-job.org calls this every 15 minutes, so the
// backlog drains progressively across ticks.

export type CrmSyncSummary = {
  ordersProcessed: number;
  ordersSynced: number;
  ordersHeld: number;
  ordersErrors: number;
  contactsResolved: number;
  purchaseRecordsCreated: number;
  tagsApplied: number;
  tagsVerified: number;
  errors: string[];
};

export async function runCrmSync(limit?: number): Promise<CrmSyncSummary> {
  const sb = getSupabaseServer();
  const errors: string[] = [];
  const out: CrmSyncSummary = {
    ordersProcessed: 0,
    ordersSynced: 0,
    ordersHeld: 0,
    ordersErrors: 0,
    contactsResolved: 0,
    purchaseRecordsCreated: 0,
    tagsApplied: 0,
    tagsVerified: 0,
    errors,
  };

  // Dynamic batch limit: prefer the explicit arg, then SYNC_BATCH_LIMIT env,
  // then default 10. Caps at 100 to stay within cron-job.org's 30s window.
  const resolvedLimit =
    limit ?? (process.env.SYNC_BATCH_LIMIT ? parseInt(process.env.SYNC_BATCH_LIMIT, 10) : 10);
  const batchLimit = Math.min(100, Math.max(1, resolvedLimit));

  // 1. Pre-fetch schema once for the entire batch.
  let cachedSchema: { schema: any; schemaVal: any } | undefined;
  try {
    const { schema } = await findPurchaseObjectSchema();
    const schemaVal = validatePurchaseSchema(schema);
    cachedSchema = { schema, schemaVal };
  } catch (e: any) {
    errors.push(`schema-discovery: ${e?.message ?? String(e)}`);
  }

  // 2. Sync eligible paid orders to the CRM (purchase records + associations).
  // Strict time-boxed loop: abort if we approach 18s so cron-job.org NEVER sees a 30s timeout.
  // 18s gives plenty of buffer for Cloudflare Worker HTTP headers and response serialization.
  const startTime = Date.now();
  const maxElapsedMs = 18_000;
  let pausedAtCursor: string | null = null;

  // In each cron push, process a tight chunk of orders (e.g. 5-10 orders)
  // Each order can have multiple line items, GHL contact searches, and tag calls.
  const effectiveBatchLimit = Math.min(10, batchLimit);

  const { data: eligible, error: eErr } = await sb
    .from("orders")
    .select("clover_order_id")
    .eq("payment_status", "PAID")
    .in("status", ["pending", "error", "held_for_review"])
    .order("created_time", { ascending: false })
    .limit(effectiveBatchLimit);
  if (eErr) {
    errors.push(`fetch eligible for sync: ${eErr.message}`);
    return out;
  }

  for (const o of eligible ?? []) {
    // Check if we're running low on time.
    if (Date.now() - startTime > maxElapsedMs) {
      console.log(
        `[sync] time ceiling reached (${Date.now() - startTime}ms), pausing batch at cursor ${o.clover_order_id}.`,
      );
      pausedAtCursor = o.clover_order_id;
      break;
    }

    try {
      out.ordersProcessed += 1;
      // Rate-limit guard: CRM enforces ~100 req/10s. On 429, back off with
      // exponential delay and continue rather than crashing the batch.
      const result = await withCrmRateLimitGuard(`order-sync ${o.clover_order_id}`, () =>
        syncOrderToGhl(o.clover_order_id, cachedSchema),
      );

      if (result.outcome === "synced" || result.outcome === "partial") {
        out.ordersSynced += 1;
        out.purchaseRecordsCreated += result.itemsSynced;
        if (result.ghlContactId) out.contactsResolved += 1;
      } else if (result.outcome === "held_for_review") {
        out.ordersHeld += 1;
      } else if (result.outcome === "error") {
        out.ordersErrors += 1;
        errors.push(`crm-sync ${o.clover_order_id}: ${result.error ?? result.message}`);
      }
    } catch (e: any) {
      // Rate-limit / transient failures are failure-isolated, not fatal.
      out.ordersErrors += 1;
      errors.push(`crm-sync ${o.clover_order_id}: ${e?.message ?? String(e)}`);
    }
  }

  // 3. Run customer purchase mapping & tag pipeline only if time remains (< 15s elapsed).
  if (Date.now() - startTime < 15_000) {
    try {
      const ops = await processPendingPurchases(Math.min(5, batchLimit));
      out.tagsApplied = ops.tagsApplied ?? 0;
      out.tagsVerified = ops.tagsVerified ?? 0;
      out.ordersErrors += ops.errors ?? 0;
    } catch (e: any) {
      errors.push(`purchase-mapping: ${e?.message ?? String(e)}`);
    }
  }

  if (pausedAtCursor) {
    (out as CrmSyncSummary & { pausedAtCursor?: string | null }).pausedAtCursor = pausedAtCursor;
    (out as CrmSyncSummary & { batchLimit?: number }).batchLimit = batchLimit;
  }

  return out;
}

// ---- Last sync run lookup ----------------------------------------------

export async function getLastSyncRun(): Promise<{
