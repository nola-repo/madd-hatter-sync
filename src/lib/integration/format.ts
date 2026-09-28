// Small shared formatting helpers for POS dashboard pages.
export function money(cents: number, currency = "USD"): string {
    const sym = currency === "USD" ? "$" : "";
    return `${sym}${(cents / 100).toFixed(2)}`;
}

export function formatMoney(cents: number, currency = "USD"): string {
    return money(cents, currency);
}

export function formatDate(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatDateTime(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function relativeTime(ms: number): string {
    if (!ms) return "—";
    const diff = Date.now() - ms;
    const day = 86400000;
    const days = Math.floor(diff / day);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} mo ago`;
    return `${Math.floor(months / 12)} yr ago`;
}

/**
 * Derive a meaningful, honest sync status for an order row.
 * Pure function — takes only the plain fields it needs (no DB imports).
 * Never claims "SYNCED" unless the order was actually processed AND has a
 * confident GHL contact mapping. Unmatched orders show their real state.
 */
export function deriveSyncStatus(o: {
    voided: boolean | null;
    payment_status: string;
    clover_customer_id: string | null;
    ghl_contact_id: string | null;
    mapping_status: string | null;
    processed_at: string | null;
    status: string;
}): string {
    if (o.voided) return "VOIDED";
    if (o.payment_status !== "PAID") return "NOT_PAID";

    const ms = o.mapping_status;
    if (ms === "NO_CUSTOMER" || (!o.clover_customer_id && !o.ghl_contact_id)) return "NO_CUSTOMER";
    if (ms === "NO_MATCH" || ms === "NO_IDENTIFIERS") return "NO_GHL_MATCH";
    if (ms === "CONFLICT") return "CONFLICT";
    if (ms === "AMBIGUOUS_MATCH" || ms === "NEEDS_REVIEW") return "NEEDS_REVIEW";

    if (o.ghl_contact_id && o.processed_at) {
        return o.status === "error" ? "PARTIAL" : "SYNCED";
    }
    if (o.ghl_contact_id) return "PROCESSED";
    return "PENDING";
}
