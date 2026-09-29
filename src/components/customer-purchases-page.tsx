//
// Customer Purchases Page — TASK 6 REFACTOR
// Replaces the old stub that showed only a basic customer list.
// Now shows every customer cross-referenced with their purchased items,
// CRM match status, total spend, and last visit date.
import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerPurchasesListFn } from "@/lib/integration/integration.functions";
import type { CustomerPurchaseRow } from "@/lib/integration/pos-data.server";

// ---- Helpers ---------------------------------------------------------------

function formatMoney(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getMatchColor(status: string): { bg: string; text: string; dot: string; label: string } {
    switch (status) {
        case "MATCHED":
            return { bg: "rgba(34,197,94,0.12)", text: "#22c55e", dot: "#22c55e", label: "CRM Matched" };
        case "NO_GHL_MATCH":
            return { bg: "rgba(234,179,8,0.12)", text: "#eab308", dot: "#eab308", label: "No CRM Match" };
        case "NO_IDENTIFIERS":
            return { bg: "rgba(239,68,68,0.12)", text: "#ef4444", dot: "#ef4444", label: "No Contact Info" };
        default:
            return { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", dot: "#9ca3af", label: status };
    }
}

function getItemColor(index: number): string {
    const colors = [
        "rgba(139,92,246,0.18)",
        "rgba(6,182,212,0.18)",
        "rgba(249,115,22,0.18)",
        "rgba(236,72,153,0.18)",
        "rgba(59,130,246,0.18)",
        "rgba(16,185,129,0.18)",
    ];
    return colors[index % colors.length] ?? "rgba(139,92,246,0.18)";
}

// ---- Sub-components --------------------------------------------------------

function ItemChips({ items }: { items: CustomerPurchaseRow["itemsPurchased"] }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? items : items.slice(0, 4);
    const more = items.length - 4;

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
            {shown.map((item, i) => (
                <span
                    key={item.name}
                    title={`${item.name} × ${item.qty}`}
                    style={{
                        background: getItemColor(i),
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "20px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.85)",
                        whiteSpace: "nowrap",
                        maxWidth: "120px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {item.name}
                    {item.qty > 1 && (
                        <span style={{ opacity: 0.6, marginLeft: "3px" }}>×{item.qty}</span>
                    )}
                </span>
            ))}
            {!expanded && more > 0 && (
                <button
                    onClick={() => setExpanded(true)}
                    style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "20px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.5)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    +{more} more
                </button>
            )}
            {items.length === 0 && (
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
                    No items recorded
                </span>
            )}
        </div>
    );
}

function MatchBadge({ status }: { status: string }) {
    const c = getMatchColor(status);
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: c.bg,
                borderRadius: "20px",
                padding: "3px 10px",
                fontSize: "11px",
                fontWeight: 600,
                color: c.text,
                border: `1px solid ${c.text}30`,
                whiteSpace: "nowrap",
            }}
        >
            <span
                style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: c.dot,
                    flexShrink: 0,
                }}
            />
            {c.label}
        </span>
    );
}

function CustomerRow({ row }: { row: CustomerPurchaseRow }) {
    const initials = row.customerName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

    return (
        <tr
            style={{
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")
            }
            onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
        >
            {/* Customer */}
            <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                        style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "50%",
                            background:
                                "linear-gradient(135deg, rgba(139,92,246,0.5) 0%, rgba(6,182,212,0.5) 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                        }}
                    >
                        {initials || "?"}
                    </div>
                    <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                            {row.customerName}
                        </div>
                        {row.email && (
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                                {row.email}
                            </div>
                        )}
                        {row.phone && (
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "1px" }}>
                                {row.phone}
                            </div>
                        )}
                    </div>
                </div>
            </td>

            {/* Items Purchased */}
            <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                <ItemChips items={row.itemsPurchased} />
            </td>

            {/* CRM Match */}
            <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                <MatchBadge status={row.matchStatus} />
                {row.matchMethod && (
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                        via {row.matchMethod.replace("_", " ")}
                    </div>
                )}
            </td>

            {/* Orders & Spend */}
            <td style={{ padding: "12px 16px", verticalAlign: "top", textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0" }}>
                    {formatMoney(row.totalSpendCents)}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                    {row.orderCount} order{row.orderCount !== 1 ? "s" : ""}
                </div>
            </td>

            {/* Last Visit */}
            <td style={{ padding: "12px 16px", verticalAlign: "top", textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                    {formatDate(row.lastVisitMs)}
                </div>
            </td>
        </tr>
    );
}

// ---- Stat Card -------------------------------------------------------------

function StatCard({
    label,
    value,
    sub,
    color,
}: {
    label: string;
    value: string | number;
    sub?: string;
    color: string;
}) {
    return (
        <div
            style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "16px 20px",
                flex: "1 1 160px",
                minWidth: "140px",
            }}
        >
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                {label}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            {sub && (
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>{sub}</div>
            )}
        </div>
    );
}

// ---- Main Component --------------------------------------------------------

export function CustomerPurchasesPage() {
    const [search, setSearch] = useState("");
    const [inputVal, setInputVal] = useState("");
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<CustomerPurchaseRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const fetchFn = useServerFn(getCustomerPurchasesListFn);
    const LIMIT = 25;

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
                setLoaded(true);
            } catch (e: any) {
                setError(e?.message ?? "Failed to load customer purchases.");
            } finally {
                setLoading(false);
            }
        },
        [fetchFn],
    );

    const handleSearch = () => {
        setSearch(inputVal);
        setPage(0);
        load(inputVal, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    };

    const handlePage = (newPage: number) => {
        setPage(newPage);
        load(search, newPage);
    };

    const totalPages = Math.ceil(total / LIMIT);
    const matched = rows.filter((r) => r.matchStatus === "MATCHED").length;
    const unmatched = rows.filter((r) => r.matchStatus !== "MATCHED").length;
    const totalSpend = rows.reduce((s, r) => s + r.totalSpendCents, 0);

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "linear-gradient(135deg, #0f0f1a 0%, #131324 50%, #0d0d1f 100%)",
                color: "#e2e8f0",
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: "32px",
            }}
        >
            {/* Page Header */}
            <div style={{ marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                    <div
                        style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "10px",
                            background: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "18px",
                        }}
                    >
                        🛍️
                    </div>
                    <div>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: "22px",
                                fontWeight: 800,
                                background: "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.7) 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            Customer Purchases
                        </h1>
                        <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                            Every Clover customer with their purchased products & CRM match status
                        </p>
                    </div>
                </div>
            </div>

            {/* Search Bar + Load Button */}
            <div
                style={{
                    display: "flex",
                    gap: "10px",
                    marginBottom: "20px",
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <input
                    id="customer-purchases-search"
                    type="text"
                    placeholder="Search by name, email, or phone…"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{
                        flex: "1 1 300px",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "10px 16px",
                        color: "#fff",
                        fontSize: "13px",
                        outline: "none",
                        maxWidth: "480px",
                    }}
                />
                <button
                    id="customer-purchases-search-btn"
                    onClick={handleSearch}
                    disabled={loading}
                    style={{
                        background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 20px",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: loading ? "wait" : "pointer",
                        opacity: loading ? 0.7 : 1,
                        whiteSpace: "nowrap",
                    }}
                >
                    {loading ? "Loading…" : loaded ? "Search" : "Load All Customers"}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div
                    style={{
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: "10px",
                        padding: "12px 16px",
                        color: "#ef4444",
                        fontSize: "13px",
                        marginBottom: "20px",
                    }}
                >
                    ⚠️ {error}
                </div>
            )}

            {/* Stats Row */}
            {loaded && (
                <div
                    style={{
                        display: "flex",
                        gap: "12px",
                        marginBottom: "20px",
                        flexWrap: "wrap",
                    }}
                >
                    <StatCard label="Total Customers" value={total} sub="on this page" color="#e2e8f0" />
                    <StatCard label="CRM Matched" value={matched} sub={`of ${rows.length} shown`} color="#22c55e" />
                    <StatCard label="No CRM Match" value={unmatched} sub="on this page" color="#eab308" />
                    <StatCard label="Page Spend" value={formatMoney(totalSpend)} sub="net sales" color="#8b5cf6" />
                </div>
            )}

            {/* Empty state before load */}
            {!loaded && !loading && !error && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px dashed rgba(255,255,255,0.1)",
                        borderRadius: "16px",
                        padding: "60px 32px",
                        textAlign: "center",
                    }}
                >
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>🛍️</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: "6px" }}>
                        View Customer Purchases
                    </div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
                        Click "Load All Customers" to see every customer with their purchased products.
                    </div>
                </div>
            )}

            {/* Loading spinner */}
            {loading && (
                <div style={{ textAlign: "center", padding: "60px 32px", color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                    <div style={{ fontSize: "32px", marginBottom: "12px", animation: "spin 1s linear infinite" }}>⏳</div>
                    Fetching customer purchases…
                </div>
            )}

            {/* Table */}
            {loaded && !loading && rows.length > 0 && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: "14px",
                        overflow: "hidden",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                {["Customer", "Items Purchased", "CRM Status", "Spend", "Last Visit"].map((h) => (
                                    <th
                                        key={h}
                                        style={{
                                            padding: "12px 16px",
                                            textAlign: h === "Spend" || h === "Last Visit" ? "right" : "left",
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            color: "rgba(255,255,255,0.35)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            background: "rgba(255,255,255,0.02)",
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <CustomerRow key={row.cloverCustomerId} row={row} />
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 16px",
                                borderTop: "1px solid rgba(255,255,255,0.06)",
                                fontSize: "12px",
                                color: "rgba(255,255,255,0.4)",
                            }}
                        >
                            <span>
                                Page {page + 1} of {totalPages} · {total} customers total
                            </span>
                            <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                    id="customer-purchases-prev"
                                    onClick={() => handlePage(page - 1)}
                                    disabled={page === 0 || loading}
                                    style={{
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "6px",
                                        padding: "5px 12px",
                                        color: "#fff",
                                        cursor: page === 0 ? "not-allowed" : "pointer",
                                        opacity: page === 0 ? 0.4 : 1,
                                        fontSize: "12px",
                                    }}
                                >
                                    ← Prev
                                </button>
                                <button
                                    id="customer-purchases-next"
                                    onClick={() => handlePage(page + 1)}
                                    disabled={page >= totalPages - 1 || loading}
                                    style={{
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "6px",
                                        padding: "5px 12px",
                                        color: "#fff",
                                        cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                                        opacity: page >= totalPages - 1 ? 0.4 : 1,
                                        fontSize: "12px",
                                    }}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty results */}
            {loaded && !loading && rows.length === 0 && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px dashed rgba(255,255,255,0.08)",
                        borderRadius: "14px",
                        padding: "48px 32px",
                        textAlign: "center",
                        color: "rgba(255,255,255,0.35)",
                        fontSize: "14px",
                    }}
                >
                    No customers found{search ? ` matching "${search}"` : ""}. Try running a Clover sync first.
                </div>
            )}
        </div>
    );
}
