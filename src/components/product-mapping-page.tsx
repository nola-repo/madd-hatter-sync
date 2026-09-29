import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProductMappingsFn } from "@/lib/integration/product-functions";
import type { ProductMappingRow } from "@/lib/integration/product-mapping.server";

function formatMoney(cents: number): string {
    return cents > 0 ? `$${(cents / 100).toFixed(2)}` : "—";
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    synced: { bg: "#dcfce7", color: "#16a34a", label: "Synced" },
    ready: { bg: "#cffafe", color: "#0891b2", label: "Ready" },
    needs_review: { bg: "#fef9c3", color: "#92400e", label: "Needs Review" },
    error: { bg: "#fee2e2", color: "#dc2626", label: "Error" },
};

const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
    default: { bg: "#f3f4f6", color: "#374151" },
    drink: { bg: "#cffafe", color: "#0891b2" },
    beer: { bg: "#fef9c3", color: "#92400e" },
    food: { bg: "#fce7f3", color: "#be185d" },
    wing: { bg: "#fee2e2", color: "#dc2626" },
    shot: { bg: "#ede9fe", color: "#7c3aed" },
    tequila: { bg: "#fef3c7", color: "#d97706" },
};

function getCatStyle(cat: string | null) {
    if (!cat) return CATEGORY_STYLE.default;
    const l = cat.toLowerCase();
    for (const key of Object.keys(CATEGORY_STYLE)) {
        if (l.includes(key)) return CATEGORY_STYLE[key]!;
    }
    return CATEGORY_STYLE.default;
}

export function ProductMappingPage() {
    const [rows, setRows] = useState<ProductMappingRow[]>([]);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            setRows(r.products ?? []);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load product mappings.");
        } finally {
            setLoading(false);
        }
    }, [fetchFn]);

    // Auto-load on mount
    useEffect(() => { load(); }, [load]);

    // Unique categories for filter
    const categories = Array.from(new Set(rows.map((r) => r.categoryName).filter(Boolean))).sort() as string[];

    const filtered = rows.filter((r) => {
        const matchSearch = !search.trim() ||
            r.itemName.toLowerCase().includes(search.toLowerCase()) ||
            (r.categoryName ?? "").toLowerCase().includes(search.toLowerCase()) ||
            r.purchaseTagName.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === "all" || r.categoryName === categoryFilter;
        return matchSearch && matchCat;
    });

    const withPurchases = rows.filter((r) => r.purchaseCount > 0).length;
    const synced = rows.filter((r) => r.ghlMappingStatus === "synced").length;

    return (
        <div style={{ padding: "28px 32px", fontFamily: "'Inter', system-ui, sans-serif", color: "#111827" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Product Mapping</h1>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                        Full Clover inventory catalog with GHL purchase tag mappings
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        background: "#fff",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        padding: "7px 16px",
                        fontSize: 13,
                        color: "#374151",
                        fontWeight: 600,
                        cursor: loading ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span style={{ display: "inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                    { label: "Total Products", value: rows.length, sub: "from Clover", color: "#111827" },
                    { label: "With Purchases", value: withPurchases, sub: "sold at least once", color: "#7c3aed" },
                    { label: "Categories", value: categories.length, color: "#0891b2" },
                    { label: "Synced to GHL", value: synced, sub: "tag mappings", color: "#16a34a" },
                    { label: "Ready to Tag", value: rows.length - synced, color: "#d97706" },
                ].map((s) => (
                    <div
                        key={s.label}
                        style={{
                            flex: "1 1 130px",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: "14px 18px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                    >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                        {s.sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                    type="text"
                    placeholder="Filter by product name, category, or GHL tag…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
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
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        padding: "8px 32px 8px 12px",
                        fontSize: 13,
                        color: categoryFilter === "all" ? "#6b7280" : "#111827",
                        background: "#fff",
                        cursor: "pointer",
                        minWidth: 180,
                        outline: "none",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 10px center",
                    }}
                >
                    <option value="all">All Categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {(search || categoryFilter !== "all") && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {filtered.length} of {rows.length} products
                        <button
                            onClick={() => { setSearch(""); setCategoryFilter("all"); }}
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
                                        padding: "10px 16px",
                                        textAlign: h.align as any,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#6b7280",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                    }}
                                >
                                    {h.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={6} style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                                    Loading product catalog…
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                                    {rows.length === 0 ? "No products found. Run a Clover sync to populate the catalog." : `No products match the current filters.`}
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.map((row) => {
                            const catStyle = getCatStyle(row.categoryName);
                            const st = STATUS_STYLE[row.ghlMappingStatus] ?? { bg: "#f3f4f6", color: "#6b7280", label: row.ghlMappingStatus };
                            return (
                                <tr
                                    key={row.cloverItemId}
                                    style={{ borderBottom: "1px solid #f3f4f6" }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f9fafb")}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
                                >
                                    <td style={{ padding: "11px 16px" }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{row.itemName}</div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, fontFamily: "monospace" }}>{row.cloverItemId}</div>
                                    </td>
                                    <td style={{ padding: "11px 16px" }}>
                                        {row.categoryName ? (
                                            <span style={{ background: catStyle.bg, color: catStyle.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
                                                {row.categoryName}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>Uncategorized</span>
                                        )}
                                    </td>
                                    <td style={{ padding: "11px 16px", textAlign: "right" }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>{formatMoney(row.priceCents)}</span>
                                    </td>
                                    <td style={{ padding: "11px 16px", textAlign: "center" }}>
                                        <span style={{
                                            display: "inline-flex", alignItems: "center", gap: 4,
                                            background: row.purchaseCount > 0 ? "#ede9fe" : "#f3f4f6",
                                            color: row.purchaseCount > 0 ? "#7c3aed" : "#9ca3af",
                                            borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700,
                                        }}>
                                            {row.purchaseCount > 0 ? "🛒 " : ""}{row.purchaseCount}
                                        </span>
                                    </td>
                                    <td style={{ padding: "11px 16px" }}>
                                        <div style={{
                                            background: "#f9fafb", border: "1px solid #e5e7eb",
                                            borderRadius: 6, padding: "3px 8px", fontSize: 11,
                                            fontFamily: "monospace", color: "#374151",
                                            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }} title={row.purchaseTagName}>
                                            {row.purchaseTagName}
                                        </div>
                                    </td>
                                    <td style={{ padding: "11px 16px" }}>
                                        <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                                            {st.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
