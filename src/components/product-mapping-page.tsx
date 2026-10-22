import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProductMappingsFn } from "@/lib/integration/product-functions";
import type { ProductMappingRow } from "@/lib/integration/product-mapping.server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton, MetricCardsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    PackageCheck,
    RefreshCw,
    Search,
    Tag,
    ShoppingBag,
    Layers,
    CheckCircle2,
    Loader2,
} from "lucide-react";
import { money } from "@/lib/integration/format";

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

    useEffect(() => {
        load();
    }, [load]);

    const categories = Array.from(
        new Set(rows.map((r) => r.categoryName).filter(Boolean)),
    ).sort() as string[];

    const filtered = rows.filter((r) => {
        const matchSearch =
            !search.trim() ||
            r.itemName.toLowerCase().includes(search.toLowerCase()) ||
            (r.categoryName ?? "").toLowerCase().includes(search.toLowerCase()) ||
            r.purchaseTagName.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === "all" || r.categoryName === categoryFilter;
        return matchSearch && matchCat;
    });

    const withPurchases = rows.filter((r) => r.purchaseCount > 0).length;
    const synced = rows.filter((r) => r.ghlMappingStatus === "synced").length;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Product Mapping"
                description="Clover inventory catalog cross-referenced with GoHighLevel purchase tagging rules."
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        disabled={loading}
                        className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
                    >
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`} />
                        Refresh Catalog
                    </Button>
                }
            />

            {/* Metrics */}
            {loading ? (
                <MetricCardsSkeleton count={4} />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-[#222226] bg-[#111113]">
                        <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Total Catalog Products</span>
                            <PackageCheck className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-white">
                            {rows.length}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">Active Clover items</div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Items with Sales</span>
                            <ShoppingBag className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
                            {withPurchases}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">Purchased at least once</div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Active Categories</span>
                            <Layers className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-blue-400">
                            {categories.length}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">Menu groups classified</div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>GHL Tag Mappings</span>
                            <Tag className="h-4 w-4 text-purple-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-white">
                            {synced} / {rows.length}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">Normalized purchase tags</div>
                    </CardContent>
                </Card>
            </div>
            )}

            {error && (
                <Card className="border-red-900/50 bg-red-950/20 text-red-200">
                    <CardContent className="p-4 text-xs font-mono">{error}</CardContent>
                </Card>
            )}

            {/* Main Table Card */}
            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <CardTitle className="text-sm font-semibold text-white font-display">
                            Tag Rule Specifications ({filtered.length})
                        </CardTitle>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                                <Input
                                    placeholder="Filter product, tag or category…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-8 w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white"
                                />
                            </div>

                            {categories.length > 0 && (
                                <Select
                                    value={categoryFilter}
                                    onValueChange={(v) => setCategoryFilter(v)}
                                >
                                    <SelectTrigger className="h-8 w-[150px] border-[#27272A] bg-[#141417] text-xs text-white">
                                        <SelectValue placeholder="All Categories" />
                                    </SelectTrigger>
                                    <SelectContent className="border-[#27272A] bg-[#141417] text-white">
                                        <SelectItem value="all">All Categories</SelectItem>
                                        {categories.map((c) => (
                                            <SelectItem key={c} value={c}>
                                                {c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <TableSkeleton rowCount={8} columnCount={6} />
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center">
                            <EmptyState
                                title="No products found"
                                description="Adjust your filters or trigger a sync from Settings."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                        <th className="py-3 px-4 font-medium">Product Name & ID</th>
                                        <th className="py-3 px-4 font-medium">Category</th>
                                        <th className="py-3 px-4 text-right font-medium">Price</th>
                                        <th className="py-3 px-4 text-center font-medium">Sold</th>
                                        <th className="py-3 px-4 font-medium">CRM Purchase Tag</th>
                                        <th className="py-3 px-4 text-right font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1A1A1E]">
                                    {filtered.map((row) => (
                                        <tr
                                            key={row.cloverItemId}
                                            className="hover:bg-[#161619] transition-colors"
                                        >
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-white">
                                                    {row.itemName}
                                                </div>
                                                <div className="font-mono text-[10px] text-[#71717A]">
                                                    {row.cloverItemId}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                {row.categoryName ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="border-zinc-700 bg-zinc-900/60 text-[10px]"
                                                    >
                                                        {row.categoryName}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[#52525B]">Uncategorized</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-[#D4D4D8]">
                                                {money(row.priceCents)}
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono font-medium text-white">
                                                {row.purchaseCount}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                <span className="inline-block px-2 py-0.5 rounded-md bg-[#18181B] border border-[#27272A] text-zinc-300 truncate max-w-[240px]">
                                                    {row.purchaseTagName}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        row.ghlMappingStatus === "synced"
                                                            ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                            : "border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]"
                                                    }
                                                >
                                                    {row.ghlMappingStatus}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
