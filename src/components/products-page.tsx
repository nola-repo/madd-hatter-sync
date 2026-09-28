import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getProductsList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money } from "@/lib/integration/format";
import type { ProductListItem } from "@/lib/integration/types";

const PAGE_SIZE = 15;

export function ProductsPage() {
    const listFn = useServerFn(getProductsList);
    const syncVersion = useSyncVersion();
    const [rows, setRows] = useState<ProductListItem[]>([]);
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
            <PageHeader
                title="Products"
                description="Product and category sales analysis from synced order items"
            />

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">Products ({total})</CardTitle>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search product or category…"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(0);
                                }}
                                className="h-8 w-56"
                            />
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
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
                        </div>
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title="No products yet"
                            description="Product sales appear once order items are synced from Clover."
                        />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th className="pb-2 pr-4 font-medium">Product</th>
                                            <th className="pb-2 pr-4 font-medium">Category</th>
                                            <th className="pb-2 pr-4 font-medium">Price</th>
                                            <th className="pb-2 pr-4 font-medium">Qty Sold</th>
                                            <th className="pb-2 pr-4 font-medium">Revenue</th>
                                            <th className="pb-2 font-medium">Orders</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((p, i) => (
                                            <tr
                                                key={(p.cloverItemId ?? p.name) + i}
                                                className="border-b border-border/50"
                                            >
                                                <td className="py-2.5 pr-4 font-medium text-foreground">{p.name}</td>
                                                <td className="py-2.5 pr-4">
                                                    {p.category ? (
                                                        <Badge variant="outline" className="text-[10px]">
                                                            {p.category}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-4 text-foreground">{money(p.priceCents)}</td>
                                                <td className="py-2.5 pr-4 text-foreground">{p.quantitySold}</td>
                                                <td className="py-2.5 pr-4 font-medium text-foreground">
                                                    {money(p.revenueCents)}
                                                </td>
                                                <td className="py-2.5 text-muted-foreground">{p.orderCount}</td>
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
