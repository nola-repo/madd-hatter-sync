import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerPurchasesListFn } from "@/lib/integration/integration.functions";
import type { CustomerPurchaseRow } from "@/lib/integration/pos-data.server";

function formatMoney(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function MatchBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; bg: string; label: string }> = {
        MATCHED: { color: "#16a34a", bg: "#dcfce7", label: "CRM Matched" },
        AUTO_CREATED: { color: "#0891b2", bg: "#cffafe", label: "Auto Created" },
        NO_GHL_MATCH: { color: "#d97706", bg: "#fef9c3", label: "No CRM Match" },
        NO_IDENTIFIERS: { color: "#dc2626", bg: "#fee2e2", label: "No Contact Info" },
    };
    const c = map[status] ?? { color: "#6b7280", bg: "#f3f4f6", label: status };
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: c.bg,
                color: c.color,
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            {c.label}
        </span>
    );
}

function ItemChips({ items }: { items: CustomerPurchaseRow["itemsPurchased"] }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? items : items.slice(0, 4);
    const more = items.length - 4;
    const palette = ["#ede9fe", "#cffafe", "#fce7f3", "#fef9c3", "#d1fae5", "#dbeafe"];
    const textPalette = ["#7c3aed", "#0891b2", "#be185d", "#92400e", "#065f46", "#1d4ed8"];

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {shown.map((item, i) => (
                <span
                    key={item.name}
                    title={`${item.name} × ${item.qty}`}
                    style={{
                        background: palette[i % palette.length],
                        color: textPalette[i % textPalette.length],
                        borderRadius: 20,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {item.name}{item.qty > 1 && <span style={{ opacity: 0.65, marginLeft: 3 }}>×{item.qty}</span>}
                </span>
            ))}
            {!expanded && more > 0 && (
                <button
                    onClick={() => setExpanded(true)}
                    style={{
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: 20,
                        padding: "2px 8px",
                        fontSize: 11,
                        color: "#6b7280",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    +{more} more
                </button>
            )}
            {items.length === 0 && (
                <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>No items</span>
            )}
        </div>
    );
}

export function CustomerPurchasesPage() {
    const [search, setSearch] = useState("");
    const [productFilter, setProductFilter] = useState<string>("all");
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<CustomerPurchaseRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFn = useServerFn(getCustomerPurchasesListFn);
    const LIMIT = 50;

    const load = useCallback(
        async (q: string, p: number) => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetchFn({ data: { search: q || undefined, limit: LIMIT, offset: p * LIMIT } });
                if (res && "setupRequired" in res && res.setupRequired) {
                    setError("Integration not configured. Please complete setup in Settings.");
                    return;
                }
                const r = res as { rows: CustomerPurchaseRow[]; total: number };
                setRows(r.rows ?? []);
                setTotal(r.total ?? 0);
            } catch (e: any) {
                setError(e?.message ?? "Failed to load customer purchases.");
            } finally {
                setLoading(false);
            }
        },
        [fetchFn],
    );

    // Auto-load on mount
    useEffect(() => { load("", 0); }, [load]);

    const handleSearch = (q: string) => {
        setSearch(q);
        setPage(0);
        setProductFilter("all");
        load(q, 0);
    };

    const handlePage = (p: number) => { setPage(p); load(search, p); };

    // Collect all unique product names for the filter dropdown
    const allProducts = Array.from(
        new Set(rows.flatMap((r) => r.itemsPurchased.map((i) => i.name)))
    ).sort();

    // Apply product filter client-side
    const filtered = productFilter === "all"
        ? rows
        : rows.filter((r) => r.itemsPurchased.some((i) => i.name === productFilter));

    const totalPages = Math.ceil(total / LIMIT);
    const matched = rows.filter((r) => r.matchStatus === "MATCHED" || r.matchStatus === "AUTO_CREATED").length;
    const totalSpend = rows.reduce((s, r) => s + r.totalSpendCents, 0);

    return (
        <div style={{ padding: "28px 32px", fontFamily: "'Inter', system-ui, sans-serif", color: "#111827" }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Customer Purchases</h1>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                    Every Clover customer with their purchased products & CRM match status
                </p>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                    { label: "Total Customers", value: total, color: "#111827" },
                    { label: "CRM Linked", value: matched, color: "#16a34a" },
                    { label: "No CRM Match", value: rows.length - matched, color: "#d97706" },
                    { label: "Total Spend", value: formatMoney(totalSpend), color: "#7c3aed" },
                ].map((s) => (
                    <div
                        key={s.label}
                        style={{
                            flex: "1 1 140px",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: "14px 18px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                    >
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Filters row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                    type="text"
                    placeholder="Search by name, email, or phone…"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    style={{
                        flex: "1 1 260px",
                        maxWidth: 400,
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 13,
                        color: "#111827",
                        outline: "none",
                        background: "#fff",
                    }}
                />
                {/* Product filter dropdown */}
                <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    style={{
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        padding: "8px 32px 8px 12px",
                        fontSize: 13,
                        color: productFilter === "all" ? "#6b7280" : "#111827",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: productFilter === "all" ? 400 : 600,
                        minWidth: 180,
                        outline: "none",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 10px center",
                    }}
                >
                    <option value="all">All Products</option>
                    {allProducts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                </select>
                {loading && <span style={{ fontSize: 12, color: "#6b7280" }}>Loading…</span>}
                {productFilter !== "all" && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {filtered.length} customer{filtered.length !== 1 ? "s" : ""} purchased <strong>{productFilter}</strong>
                        <button
                            onClick={() => setProductFilter("all")}
                            style={{ marginLeft: 6, fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                            clear
                        </button>
                    </span>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Table */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#f9fafb" }}>
                            {["Customer", "Items Purchased", "CRM Status", "Spend", "Last Visit"].map((h) => (
                                <th
                                    key={h}
                                    style={{
                                        padding: "10px 16px",
                                        textAlign: h === "Spend" || h === "Last Visit" ? "right" : "left",
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#6b7280",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                    }}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                                    Loading customer purchases…
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                                    {productFilter !== "all" ? `No customers purchased "${productFilter}"` : "No customers found."}
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.map((row) => {
                            const initials = row.customerName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                            return (
                                <tr
                                    key={row.cloverCustomerId}
                                    style={{ borderBottom: "1px solid #f3f4f6" }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f9fafb")}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
                                >
                                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: "50%",
                                                background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                                            }}>
                                                {initials || "?"}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{row.customerName}</div>
                                                {row.email && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{row.email}</div>}
                                                {row.phone && <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.phone}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                                        <ItemChips items={row.itemsPurchased} />
                                    </td>
                                    <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                                        <MatchBadge status={row.matchStatus} />
                                        {row.matchMethod && (
                                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>
                                                via {row.matchMethod.replace("_", " ")}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: "12px 16px", verticalAlign: "top", textAlign: "right" }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{formatMoney(row.totalSpendCents)}</div>
                                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{row.orderCount} order{row.orderCount !== 1 ? "s" : ""}</div>
                                    </td>
                                    <td style={{ padding: "12px 16px", verticalAlign: "top", textAlign: "right" }}>
                                        <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDate(row.lastVisitMs)}</div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#6b7280" }}>
                        <span>Page {page + 1} of {totalPages} · {total} customers total</span>
                        <div style={{ display: "flex", gap: 6 }}>
                            {[{ label: "← Prev", p: page - 1, dis: page === 0 }, { label: "Next →", p: page + 1, dis: page >= totalPages - 1 }].map((btn) => (
                                <button
                                    key={btn.label}
                                    onClick={() => handlePage(btn.p)}
                                    disabled={btn.dis || loading}
                                    style={{
                                        background: btn.dis ? "#f9fafb" : "#fff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 6,
                                        padding: "5px 12px",
                                        fontSize: 12,
                                        color: btn.dis ? "#d1d5db" : "#374151",
                                        cursor: btn.dis ? "not-allowed" : "pointer",
                                    }}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
