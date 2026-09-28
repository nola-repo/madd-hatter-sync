//
// Server-only shared helpers for the Clover ingestion + order-fetch layers.
// Keeping these in a focused module keeps ingestion.server.ts thin and avoids
// duplicating money/date/payment-status logic across files.
import { getSupabaseServer } from "./supabase.server";

export function cents(v: any): number {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

export function num(v: any): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Derive an order's payment status from its raw Clover order + payments.
 *
 * Clover payments carry a `result` field (SUCCESS | FAILED | PENDING | VOIDED).
 * Only SUCCESS payments represent captured funds. VOIDED and FAILED payments
 * are excluded from "paid" totals so sales reports reconcile with Clover's
 * own dashboard, which never counts voided/failed transactions as revenue.
 */
export function derivePaymentStatus(order: any, payments: any[]): string {
    const total = cents(order.total);
    if (total <= 0 && payments.length === 0) return "OPEN";
    const successful = payments.filter((p) => !p.result || p.result === "SUCCESS");
    const paid = successful.reduce((s, p) => s + cents(p.amount), 0);
    const refunded = successful.reduce((s, p) => s + cents(p.refundedAmount), 0);
    if (refunded > 0 && refunded >= paid && paid > 0) return "REFUNDED";
    if (paid === 0) return "OPEN";
    if (paid < total) return "PARTIALLY_PAID";
    return "PAID";
}

/** Net sales for a single order = sum of line item totals (modifiers added,
 *  line discounts removed). Excludes tax, tip, and service charge — matching
 *  how Clover's dashboard reports Net Sales rather than the order `total`. */
export function orderNetSales(lineItems: any[]): number {
    return lineItems.reduce((s, li) => {
        const unit = cents(li.price);
        const qty = num(li.quantity ?? 1);
        const mods = (li.modifiers?.elements ?? li.modifiers ?? []).reduce(
            (ms: number, m: any) => ms + cents(m.amount ?? m.price),
            0,
        );
        const disc = (li.discounts?.elements ?? li.discounts ?? []).reduce(
            (ds: number, d: any) => ds + cents(d.amount),
            0,
        );
        return s + Math.max(0, unit * qty + mods - disc);
    }, 0);
}

export async function upsertRefund(merchantId: string, r: any) {
    const sb = getSupabaseServer();
    const { error } = await sb.from("refunds").upsert(
        {
            clover_merchant_id: merchantId,
            clover_refund_id: r.id,
            clover_order_id: r.order?.id ?? null,
            clover_payment_id: r.payment?.id ?? null,
            amount_cents: cents(r.amount),
            tax_amount_cents: cents(r.taxAmount),
            tip_amount_cents: cents(r.tipAmount),
            created_time: typeof r.createdTime === "number" ? r.createdTime : 0,
        },
        { onConflict: "clover_merchant_id,clover_refund_id" },
    );
    if (error) throw new Error(`upsert refund: ${error.message}`);
}

export async function upsertPayment(merchantId: string, p: any) {
    const sb = getSupabaseServer();
    const { error } = await sb.from("payments").upsert(
        {
            clover_merchant_id: merchantId,
            clover_payment_id: p.id,
            clover_order_id: p.order?.id ?? null,
            clover_employee_id: p.employee?.id ?? null,
            amount_cents: cents(p.amount),
            tax_amount_cents: cents(p.taxAmount),
            tip_amount_cents: cents(p.tipAmount),
            cash_tendered_cents: cents(p.cashTendered),
            payment_type: p.tender?.label ?? p.tender?.type ?? null,
            result: p.result ?? null,
            card_type: p.cardTransaction?.cardType ?? null,
            currency: p.currency ?? "USD",
            created_time: typeof p.createdTime === "number" ? p.createdTime : 0,
        },
        { onConflict: "clover_merchant_id,clover_payment_id" },
    );
    if (error) throw new Error(`upsert payment: ${error.message}`);
}
