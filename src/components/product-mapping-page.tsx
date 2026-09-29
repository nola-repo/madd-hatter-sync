//
// Product Mapping Page — TASK 7 REFACTOR
// Replaces the alias to PurchaseMappingPage with a real product catalog component.
// Shows every Clover inventory item with its canonical GHL tag, purchase count,
// category, and price.
import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProductMappingsFn } from "@/lib/integration/product-functions";
import type { ProductMappingRow } from "@/lib/integration/product-mapping.server";


// ---- Helpers ---------------------------------------------------------------

function formatMoney(cents: number): string {
    return cents > 0 ? `$${(cents / 100).toFixed(2)}` : "—";
}

function getMappingStatusStyle(status: string): { bg: string; text: string; label: string } {
    switch (status) {
        case "synced":
            return { bg: "rgba(34,197,94,0.12)", text: "#22c55e", label: "Synced to GHL" };
        case "ready":
            return { bg: "rgba(6,182,212,0.12)", text: "#06b6d4", label: "Ready" };
        case "needs_review":
            return { bg: "rgba(234,179,8,0.12)", text: "#eab308", label: "Needs Review" };
        case "error":
            return { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Error" };
        default:
            return { bg: "rgba(156,163,175,0.1)", text: "#9ca3af", label: status };
    }
}

function getCategoryColor(cat: string | null): string {
    if (!cat) return "rgba(107,114,128,0.2)";
    const s = cat.toLowerCase();
    if (s.includes("drink") || s.includes("beer") || s.includes("beverage")) return "rgba(6,182,212,0.2)";
    if (s.includes("food") || s.includes("kitchen") || s.includes("appetizer")) return "rgba(249,115,22,0.2)";
    if (s.includes("wing")) return "rgba(239,68,68,0.2)";
    if (s.includes("burger") || s.includes("sandwich")) return "rgba(234,179,8,0.2)";
    return "rgba(139,92,246,0.2)";
}

// ---- Sub-components --------------------------------------------------------

function MappingStatusBadge({ status }: { status: string }) {
    const s = getMappingStatusStyle(status);
    return (
        <span
            style={{
                display: "inline-block",
                background: s.bg,
                borderRadius: "20px",
                padding: "2px 10px",
                fontSize: "11px",
                fontWeight: 600,
                color: s.text,
                border: `1px solid ${s.text}30`,
                whiteSpace: "nowrap",
            }}
        >
            {s.label}
        </span>
    );
}

function ProductRow({ row }: { row: ProductMappingRow }) {
    return (
        <tr
            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)")
            }
            onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
        >
            {/* Product Name */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>{row.itemName}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "2px", fontFamily: "monospace" }}>
                    {row.cloverItemId}
                </div>
            </td>

            {/* Category */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle" }}>
                {row.categoryName ? (
                    <span
                        style={{
                            background: getCategoryColor(row.categoryName),
                            borderRadius: "20px",
                            padding: "2px 10px",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "rgba(255,255,255,0.7)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {row.categoryName}
                    </span>
                ) : (
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
                        Uncategorized
                    </span>
                )}
            </td>

            {/* Price */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle", textAlign: "right" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#a3e635" }}>
                    {formatMoney(row.priceCents)}
                </span>
            </td>

            {/* Times Purchased */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle", textAlign: "center" }}>
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background:
                            row.purchaseCount > 0
                                ? "rgba(139,92,246,0.15)"
                                : "rgba(255,255,255,0.04)",
                        borderRadius: "20px",
                        padding: "3px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: row.purchaseCount > 0 ? "#a78bfa" : "rgba(255,255,255,0.25)",
                    }}
                >
                    {row.purchaseCount > 0 ? "🛒" : ""} {row.purchaseCount}
                </div>
            </td>

            {/* GHL Tag Name */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle" }}>
                <div
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.6)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        maxWidth: "220px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                    title={row.purchaseTagName}
                >
                    {row.purchaseTagName}
                </div>
            </td>

            {/* Status */}
            <td style={{ padding: "11px 16px", verticalAlign: "middle" }}>
                <MappingStatusBadge status={row.ghlMappingStatus} />
            </td>
        </tr>
    );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
    return (
        <div
            style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "16px 20px",
                flex: "1 1 140px",
                minWidth: "130px",
            }}
        >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                {label}
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>{sub}</div>}
        </div>
    );
}

// ---- Main Component --------------------------------------------------------

export function ProductMappingPage() {
    const [rows, setRows] = useState<ProductMappingRow[]>([]);
    const [filtered, setFiltered] = useState<ProductMappingRow[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const fetchFn = useServerFn(getProductMappingsFn);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchFn();
            if (res && "setupRequired" in res && res.setupRequired) {

                setError("Integration not configured. Please complete setup in Settings.");
                return;
            }
            const r = res as { products: ProductMappingRow[] };
            const allRows = r.products ?? [];

            setRows(allRows);
            setFiltered(allRows);
            setLoaded(true);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load product mappings.");
        } finally {
            setLoading(false);
        }
    }, [fetchFn]);

    const handleSearch = (q: string) => {
        setSearch(q);
        const lower = q.toLowerCase().trim();
        if (!lower) {
            setFiltered(rows);
        } else {
            setFiltered(
                rows.filter(
                    (r) =>
                        r.itemName.toLowerCase().includes(lower) ||
                        (r.categoryName ?? "").toLowerCase().includes(lower) ||
                        r.purchaseTagName.toLowerCase().includes(lower),
                ),
            );
        }
    };

    // Stats
    const synced = rows.filter((r) => r.ghlMappingStatus === "synced").length;
    const ready = rows.filter((r) => r.ghlMappingStatus === "ready").length;
    const withPurchases = rows.filter((r) => r.purchaseCount > 0).length;
    const categories = new Set(rows.map((r) => r.categoryName).filter(Boolean)).size;

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
            {/* Header */}
            <div style={{ marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                            style={{
                                width: "38px",
                                height: "38px",
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "18px",
                            }}
                        >
                            🏷️
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
                                Product Mapping
                            </h1>
                            <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                                Full Clover inventory catalog with GHL purchase tag mappings
                            </p>
                        </div>
                    </div>

                    {!loaded && (
                        <button
                            id="product-mapping-load-btn"
                            onClick={load}
                            disabled={loading}
                            style={{
                                background: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
                                border: "none",
                                borderRadius: "10px",
                                padding: "10px 20px",
                                color: "#fff",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: loading ? "wait" : "pointer",
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? "Loading…" : "Load Product Catalog"}
                        </button>
                    )}

                    {loaded && (
                        <button
                            id="product-mapping-refresh-btn"
                            onClick={load}
                            disabled={loading}
                            style={{
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "10px",
                                padding: "8px 16px",
                                color: "rgba(255,255,255,0.7)",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: loading ? "wait" : "pointer",
                            }}
                        >
                            ↻ Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div
                    style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.25)",
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

            {/* Stats */}
            {loaded && (
                <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
                    <SummaryCard label="Total Products" value={rows.length} sub="from Clover" color="#e2e8f0" />
                    <SummaryCard label="With Purchases" value={withPurchases} sub="sold at least once" color="#a78bfa" />
                    <SummaryCard label="Categories" value={categories} color="#06b6d4" />
                    <SummaryCard label="Synced to GHL" value={synced} sub="tag mappings" color="#22c55e" />
                    <SummaryCard label="Ready to Tag" value={ready} color="#eab308" />
                </div>
            )}

            {/* Search */}
            {loaded && (
                <div style={{ marginBottom: "16px" }}>
                    <input
                        id="product-mapping-search"
                        type="text"
                        placeholder="Filter by product name, category, or GHL tag…"
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "10px",
                            padding: "10px 16px",
                            color: "#fff",
                            fontSize: "13px",
                            width: "100%",
                            maxWidth: "480px",
                            outline: "none",
                            boxSizing: "border-box",
                        }}
                    />
                    {search && (
                        <span style={{ marginLeft: "12px", fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                            {filtered.length} of {rows.length} products
                        </span>
                    )}
                </div>
            )}

            {/* Empty / Not Loaded State */}
            {!loaded && !loading && !error && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px dashed rgba(255,255,255,0.08)",
                        borderRadius: "16px",
                        padding: "64px 32px",
                        textAlign: "center",
                    }}
                >
                    <div style={{ fontSize: "44px", marginBottom: "12px" }}>🏷️</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: "8px" }}>
                        Your Full Clover Product Catalog
                    </div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", maxWidth: "400px", margin: "0 auto" }}>
                        Click "Load Product Catalog" to see all Clover inventory items alongside
                        their canonical GHL purchase tag names and sales frequencies.
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: "center", padding: "60px 32px", color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                    <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
                    Loading product catalog…
                </div>
            )}

            {/* Table */}
            {loaded && !loading && filtered.length > 0 && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: "14px",
                        overflow: "hidden",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                                {[
                                    { label: "Product", align: "left" },
                                    { label: "Category", align: "left" },
                                    { label: "Price", align: "right" },
                                    { label: "Sold", align: "center" },
                                    { label: "GHL Tag Name", align: "left" },
                                    { label: "Status", align: "left" },
                                ].map((h) => (
                                    <th
                                        key={h.label}
                                        style={{
                                            padding: "11px 16px",
                                            textAlign: h.align as any,
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            color: "rgba(255,255,255,0.3)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.07em",
                                        }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row) => (
                                <ProductRow key={row.cloverItemId} row={row} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty search result */}
            {loaded && !loading && filtered.length === 0 && rows.length > 0 && (
                <div
                    style={{
                        textAlign: "center",
                        padding: "40px 32px",
                        color: "rgba(255,255,255,0.3)",
                        fontSize: "13px",
                    }}
                >
                    No products matching "{search}". Try a different search term.
                </div>
            )}

            {/* No products in DB */}
            {loaded && !loading && rows.length === 0 && (
                <div
                    style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px dashed rgba(255,255,255,0.07)",
                        borderRadius: "14px",
                        padding: "48px 32px",
                        textAlign: "center",
                        color: "rgba(255,255,255,0.3)",
                        fontSize: "14px",
                    }}
                >
                    No products found in the database. Run a Clover sync from the Dashboard or Settings page to populate the product catalog.
                </div>
            )}
        </div>
    );
}
