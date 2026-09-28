//
// Server-only Clover REST client (sandbox). Reads the API key from config.
// Docs: Clover REST API v3 — https://docs.clover.com/reference
import { getIntegrationConfig } from "./config.server";
import type {
    CloverConnectionDetail,
    CloverCustomer,
    CloverLineItem,
    CloverOrder,
    CloverMoney,
} from "./types";

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

async function cloverFetch(path: string): Promise<any> {
    const cfg = getIntegrationConfig();
    const rawKey = cfg.clover.apiKey?.trim() ?? "";
    const sep = path.includes("?") ? "&" : "?";

    // Try Bearer header first
    let res = await fetch(`${cfg.clover.apiBase}${path}`, {
        headers: {
            Authorization: `Bearer ${rawKey}`,
            Accept: "application/json",
        },
    });

    // If 401, fallback to access_token query param
    if (res.status === 401) {
        res = await fetch(
            `${cfg.clover.apiBase}${path}${sep}access_token=${encodeURIComponent(rawKey)}`,
            {
                headers: {
                    Accept: "application/json",
                },
            },
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

function money(cents: number | undefined | null, currency: string): CloverMoney {
    return { cents: cents ?? 0, currency: currency ?? "USD" };
}

function centsFromValue(v: any): number {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? Math.round(n) : 0;
    }
    return 0;
}

// ---- Customer ----------------------------------------------------------

export async function fetchCloverCustomer(
    merchantId: string,
    customerId: string,
): Promise<CloverCustomer | null> {
    // Clover: GET /v3/merchants/{mId}/customers/{cId}
    try {
        const json = await cloverFetch(
            `/v3/merchants/${merchantId}/customers/${customerId}?expand=emailAddresses,phoneNumbers,addresses`,
        );
        if (!json) return null;
        const c = json.customer ?? json;
        const addr = c.addresses?.[0] ?? c.addresses?.elements?.[0];
        const email =
            c.email ??
            c.emailAddresses?.[0]?.emailAddress ??
            c.emailAddresses?.elements?.[0]?.emailAddress ??
            (typeof c.emailAddresses?.[0] === "string" ? c.emailAddresses[0] : null);
        const phone =
            c.phone ??
            c.phoneNumbers?.[0]?.phoneNumber ??
            c.phoneNumbers?.elements?.[0]?.phoneNumber ??
            (typeof c.phoneNumbers?.[0] === "string" ? c.phoneNumbers[0] : null) ??
            addr?.phoneNumber ??
            null;
        return {
            id: c.id ?? customerId,
            merchantId,
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            email: email ? String(email).trim() : null,
            phone: phone ? String(phone).trim() : null,
        };
    } catch (e) {
        if (e instanceof CloverApiError && e.status === 404) return null;
        throw e;
    }
}

// ---- Order -------------------------------------------------------------

export async function fetchCloverOrder(orderId: string): Promise<CloverOrder> {
    const cfg = getIntegrationConfig();
    const merchantId = cfg.clover.merchantId;

    // Full expansion so the order is self-contained: line items, payments,
    // refunds, credits, discounts, service charge, customers, and modifiers.
    const expand = [
        "lineItems",
        "lineItems.discounts",
        "lineItems.modifiers",
        "payments",
        "payments.refunds",
        "refunds",
        "credits",
        "discounts",
        "serviceCharge",
        "customers",
    ];
    const json = await cloverFetch(
        `/v3/merchants/${merchantId}/orders/${orderId}?expand=${encodeURIComponent(expand.join(","))}`,
    );
    const order = json.order ?? json;

    // Currency: Clover stores currency on the order or on line items.
    const currency: string = order.currency ?? "USD";

    // Customers attached to the order.
    const customersRaw: any[] = order.customers ?? [];
    const customerIds: string[] = customersRaw.map((c: any) => c.id).filter(Boolean);

    // Resolve the "primary" customer: the first attached, or order.customer.id.
    let primaryCustomer: CloverCustomer | null = null;
    const primaryId: string | undefined = order.customer?.id ?? customerIds[0];
    if (primaryId) {
        // If the expanded customer object has enough detail, use it; otherwise fetch.
        const expanded = customersRaw.find((c: any) => c.id === primaryId);
        if (expanded && (expanded.email || expanded.phone || expanded.firstName)) {
            primaryCustomer = {
                id: expanded.id,
                merchantId,
                firstName: expanded.firstName ?? null,
                lastName: expanded.lastName ?? null,
                email: expanded.email ?? expanded.emailAddresses?.[0] ?? null,
                phone: expanded.phone ?? expanded.phoneNumbers?.[0] ?? null,
            };
        } else {
            primaryCustomer = await fetchCloverCustomer(merchantId, primaryId);
        }
    }

    // Line items.
    const rawItems: any[] = order.lineItems?.elements ?? order.lineItems ?? [];
    const lineItems: CloverLineItem[] = rawItems.map((li: any) => {
        const unit = centsFromValue(li.price);
        const qty = typeof li.quantity === "number" ? li.quantity : Number(li.quantity ?? 1);
        const modifiers = (li.modifiers?.elements ?? li.modifiers ?? []).map((m: any) => ({
            name: m.name ?? "Modifier",
            amount: money(centsFromValue(m.amount ?? m.price), currency),
        }));
        const discountAmount = money(
            centsFromValue(li.discounts?.elements?.[0]?.amount ?? li.discountAmount),
            currency,
        );
        const lineTotal = computeLineTotal(unit, qty, modifiers, discountAmount.cents);
        return {
            id: li.id,
            name: li.name ?? "Item",
            price: money(unit, currency),
            quantity: qty,
            note: li.note ?? null,
            modifiers,
            discountAmount,
            cloverItemId: li.item?.id ?? li.itemId ?? null,
            category: li.categoryName ?? li.category ?? null,
        };
    });

    // Payment status.
    const payments: any[] = order.payments?.elements ?? order.payments ?? [];
    const paymentStatus = derivePaymentStatus(order, payments);

    // Total.
    const total = money(centsFromValue(order.total), currency);

    // Location name (merchant name) — Clover order doesn't always carry it.
    let locationName: string | null = null;
    try {
        const m = await cloverFetch(`/v3/merchants/${merchantId}?fields=name`);
        locationName = (m.name as string) ?? null;
    } catch {
        locationName = null;
    }

    return {
        id: order.id ?? orderId,
        merchantId,
        orderType: order.orderType ?? null,
        createdTime: typeof order.createdTime === "number" ? order.createdTime : Date.now(),
        customer: primaryCustomer,
        customerIds,
        lineItems,
        total,
        paymentStatus,
        currency,
        locationName,
    };
}

function computeLineTotal(
    unitCents: number,
    qty: number,
    modifiers: { amount: CloverMoney }[],
    discountCents: number,
): CloverMoney {
    const modSum = modifiers.reduce((s, m) => s + m.amount.cents, 0);
    const gross = unitCents * qty + modSum;
    const net = Math.max(0, gross - discountCents);
    return { cents: net, currency: "USD" };
}

function derivePaymentStatus(order: any, payments: any[]): CloverOrder["paymentStatus"] {
    const total = centsFromValue(order.total);
    if (total <= 0 && payments.length === 0) return "OPEN";
    // Clover payments carry a `result` field: SUCCESS, FAILED, PENDING, VOIDED.
    // Only SUCCESS payments actually represent captured funds. VOIDED and FAILED
    // payments are not paid funds and must be excluded — summing all payments
    // would over-count sales when voided/failed transactions are present.
    const successfulPayments = payments.filter((p) => !p.result || p.result === "SUCCESS");
    const paid = successfulPayments.reduce((s, p) => s + centsFromValue(p.amount), 0);
    const refunded = successfulPayments.reduce((s, p) => s + centsFromValue(p.refundedAmount), 0);
    if (refunded > 0 && refunded >= paid && paid > 0) return "REFUNDED";
    if (paid === 0) return "OPEN";
    if (paid < total) return "PARTIALLY_PAID";
    return "PAID";
}

// ---- Fetch recent orders list from Clover directly ---------------------

export type CloverRecentOrderSummary = {
    id: string;
    total: CloverMoney;
    createdTime: number;
    paymentStatus: "PAID" | "PARTIALLY_PAID" | "OPEN" | "REFUNDED" | "UNKNOWN";
    customerName: string | null;
    itemsCount: number;
};

export async function fetchRecentCloverOrders(
    limit: number = 20,
): Promise<CloverRecentOrderSummary[]> {
    const cfg = getIntegrationConfig();
    const mId = cfg.clover.merchantId;
    const path = `/v3/merchants/${mId}/orders?expand=customers,payments,payments.refunds,lineItems&limit=${limit}&orderBy=createdTime+DESC`;
    const json = await cloverFetch(path);
    const elements = json?.elements ?? json?.orders ?? [];

    return elements.map((order: any) => {
        const currency = order.currency ?? "USD";
        const total = money(centsFromValue(order.total), currency);
        const payments = order.payments?.elements ?? order.payments ?? [];
        const paymentStatus = derivePaymentStatus(order, payments);
        const customer = order.customers?.elements?.[0] ?? order.customer ?? null;
        const customerName = customer
            ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.name || null
            : null;
        const itemsCount = (order.lineItems?.elements ?? order.lineItems ?? []).length;

        return {
            id: order.id,
            total,
            createdTime: typeof order.createdTime === "number" ? order.createdTime : Date.now(),
            paymentStatus,
            customerName,
            itemsCount,
        };
    });
}

// ---- Connection check --------------------------------------------------

function emptyValidation() {
    return {
        merchantApi: null as boolean | null,
        ordersApi: null as boolean | null,
        customersApi: null as boolean | null,
        paymentsApi: null as boolean | null,
        inventoryApi: null as boolean | null,
    };
}

export async function checkCloverConnection(): Promise<CloverConnectionDetail> {
    const cfg = getIntegrationConfig();
    const base: CloverConnectionDetail = {
        connected: false,
        detail: "",
        environment: cfg.clover.environment,
        merchantId: cfg.clover.merchantId,
        merchantName: null,
        baseUrl: cfg.clover.apiBase,
        httpStatus: null,
        errorCode: null,
        validation: emptyValidation(),
        diagnostic: null,
    };

    // STEP 1: merchant endpoint — proves auth + merchant/token pairing.
    // Clover Sandbox supports Bearer header OR ?access_token= query param depending on token type.
    // We test the Bearer header first, and fallback to query param if 401 occurs.
    const token = cfg.clover.apiKey.trim();
    const mId = cfg.clover.merchantId.trim();
    const tokenLoaded = token.length > 0;

    async function probeMerchant(useParam: boolean) {
        const path = `/v3/merchants/${mId}?fields=id,name`;
        const url = useParam
            ? `${cfg.clover.apiBase}${path}&access_token=${encodeURIComponent(token)}`
            : `${cfg.clover.apiBase}${path}`;
        const headers: Record<string, string> = {
            Accept: "application/json",
        };
        if (!useParam) {
            headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(url, { headers });
        const text = await res.text();
        return {
            status: res.status,
            ok: res.ok,
            text,
            path,
            authMode: useParam ? "access_token query param" : "Authorization: Bearer header",
        };
    }

    try {
        let raw = await probeMerchant(false);
        let usedParam = false;
        let paramAttempt: { status: number; authMode: string; body: string } | null = null;
        if (!raw.ok && raw.status === 401) {
            // Try with query parameter in case token is a test API token or pak_ token
            const paramTry = await probeMerchant(true);
            paramAttempt = {
                status: paramTry.status,
                authMode: paramTry.authMode,
                body: paramTry.text.slice(0, 300),
            };
            if (paramTry.ok) {
                raw = paramTry;
                usedParam = true;
            }
        }

        base.httpStatus = raw.status;
        base.diagnostic = {
            endpoint: raw.path,
            method: "GET",
            baseUrl: cfg.clover.apiBase,
            authMode: usedParam ? "access_token query param" : "Authorization: Bearer header",
            httpStatus: raw.status,
            responseBody: raw.text.slice(0, 500),
            // Non-secret indicators so the user can confirm the runtime loaded the
            // secret correctly without ever exposing the token value.
            tokenLoaded,
            tokenLength: token.length,
            merchantId: mId,
            // If both auth modes were tried and both failed, surface the second
            // attempt so the user sees that neither worked.
            alternateAttempt: paramAttempt,
        };

        if (!raw.ok) {
            throw new CloverApiError(raw.status, raw.text);
        }

        let json: any = null;
        try {
            json = raw.text ? JSON.parse(raw.text) : null;
        } catch {
            json = null;
        }

        base.validation.merchantApi = true;
        base.merchantName = json?.name ?? json?.id ?? null;
        base.connected = true;
        base.detail = `Connected to merchant: ${base.merchantName ?? mId}`;
    } catch (e: any) {
        if (e instanceof CloverApiError) {
            base.httpStatus = e.status;
            base.errorCode =
                e.status === 401
                    ? "CLOVER_AUTH_FAILED"
                    : e.status === 404
                        ? "CLOVER_MERCHANT_NOT_FOUND"
                        : `CLOVER_HTTP_${e.status}`;
            // Sanitized message — never includes the token.
            const bodyMsg = (() => {
                try {
                    const p = JSON.parse(e.body);
                    return p?.message ?? p?.error ?? e.body.slice(0, 120);
                } catch {
                    return e.body.slice(0, 120);
                }
            })();
            base.detail = `Clover ${e.status} ${base.errorCode}: ${bodyMsg}. Verify that CLOVER_ACCESS_TOKEN belongs to merchant ${mId} in the ${cfg.clover.environment === "sandbox" ? "Sandbox" : "Production"} environment. For production, generate the token at clover.com/setupapp/m/${mId}/api-tokens (Merchant Dashboard > API Tokens). For sandbox, use sandbox.dev.clover.com under the sandbox test merchant.`;
            if (!base.diagnostic) {
                base.diagnostic = {
                    endpoint: `/v3/merchants/${mId}?fields=id,name`,
                    method: "GET",
                    baseUrl: cfg.clover.apiBase,
                    authMode: "Authorization: Bearer header",
                    httpStatus: e.status,
                    responseBody: e.body.slice(0, 500),
                    tokenLoaded,
                    tokenLength: token.length,
                    merchantId: mId,
                    alternateAttempt: null,
                };
            }
        } else {
            base.errorCode = "CLOVER_REQUEST_ERROR";
            base.detail = e?.message ?? "Clover connection failed";
        }
        return base;
    }

    // STEP 2: data-validation probes (only if merchant auth succeeded).
    // Each probe is independent — a failure flags the API but does not abort others.
    const probes: Array<[keyof CloverConnectionDetail["validation"], string]> = [
        ["ordersApi", `/v3/merchants/${cfg.clover.merchantId}/orders?limit=1`],
        ["customersApi", `/v3/merchants/${cfg.clover.merchantId}/customers?limit=1`],
        ["paymentsApi", `/v3/merchants/${cfg.clover.merchantId}/payments?limit=1`],
        ["inventoryApi", `/v3/merchants/${cfg.clover.merchantId}/items?limit=1`],
    ];
    for (const [key, path] of probes) {
        try {
            await cloverFetch(path);
            base.validation[key] = true;
        } catch (e: any) {
            base.validation[key] = false;
            // 401 on a probe after merchant success => missing permission scope.
            if (e instanceof CloverApiError && e.status === 401) {
                base.detail = `${base.detail} · ${String(key)} scope missing`;
            }
        }
    }

    return base;
}
