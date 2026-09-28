import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getInventoryProductsList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money } from "@/lib/integration/format";
import type { ProductRow } from "@/lib/integration/types";

const PAGE_SIZE = 25;

export function ItemsPage() {
    const listFn = useServerFn(getInventoryProductsList);
    const syncVersion = useSyncVersion();
    const [rows, setRows] = useState<ProductRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listFn({
                data: { search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
            });
            if (res?.setupRequired) return;
            setRows(res.rows);
            setTotal(res.total);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, [listFn, search, page]);

    useEffect(() => {
        load();
    }, [load, syncVersion]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            <PageHeader title="Item List" description="Clover inventory items with sales performance" />

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">Items ({total})</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search name, category, SKU…"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(0);
                                    }}
                                    className="h-8 w-56 pl-8"
                                />
                            </div>
                            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
                        </div>
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title="No items yet"
                            description="Click Refresh POS Data above to pull inventory items from Clover."
                        />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th className="pb-2 pr-4 font-medium">Item ID</th>
                                            <th className="pb-2 pr-4 font-medium">Name</th>
                                            <th className="pb-2 pr-4 font-medium">Category</th>
                                            <th className="pb-2 pr-4 font-medium">SKU</th>
                                            <th className="pb-2 pr-4 font-medium">Price</th>
                                            <th className="pb-2 pr-4 font-medium">Qty Sold</th>
                                            <th className="pb-2 pr-4 font-medium">Revenue</th>
                                            <th className="pb-2 font-medium">Orders</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((p) => (
                                            <tr key={p.cloverItemId} className="border-b border-border/50">
                                                <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                                                    {p.cloverItemId}
                                                </td>
                                                <td className="py-2.5 pr-4 font-medium text-foreground">{p.name}</td>
                                                <td className="py-2.5 pr-4 text-muted-foreground">{p.category ?? "—"}</td>
                                                <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                                                    {p.sku ?? "—"}
                                                </td>
                                                <td className="py-2.5 pr-4 text-foreground">{money(p.priceCents)}</td>
                                                <td className="py-2.5 pr-4 text-muted-foreground">{p.quantitySold}</td>
                                                <td className="py-2.5 pr-4 font-medium text-foreground">
                                                    {money(p.revenueCents)}
                                                </td>
                                                <td className="py-2.5">
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {p.orderCount}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                    Page {page + 1} of {totalPages}
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= totalPages - 1}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
