import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getOrdersList, getOrderItemsList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type { OrderListItem, OrderItemListRow } from "@/lib/integration/types";

const PAGE_SIZE = 15;

export function PosDataPage() {
    return (
        <div>
            <PageHeader title="POS Data" description="Inspect imported orders and order items" />
            <Tabs defaultValue="orders">
                <TabsList>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="items">Order Items</TabsTrigger>
                </TabsList>
                <TabsContent value="orders" className="mt-4">
                    <OrdersTab />
                </TabsContent>
                <TabsContent value="items" className="mt-4">
                    <ItemsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function OrdersTab() {
    const listFn = useServerFn(getOrdersList);
    const syncVersion = useSyncVersion();
    const [rows, setRows] = useState<OrderListItem[]>([]);
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
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">Orders ({total})</CardTitle>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Search order ID…"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(0);
                            }}
                            className="h-8 w-48"
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
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState title="No orders" description="No imported order records found." />
                ) : (
                    <DataTable
                        headers={["Order ID", "Date", "Customer", "Total", "Payment", "Status"]}
                        rows={rows.map((o) => [
                            o.cloverOrderId,
                            formatDateTime(o.createdTime),
                            o.cloverCustomerId ?? "—",
                            money(o.totalCents, o.currency),
                            <Badge variant="outline" className="text-[10px]">
                                {o.paymentStatus}
                            </Badge>,
                            <Badge variant="secondary" className="text-[10px]">
                                {o.status}
                            </Badge>,
                        ])}
                        page={page}
                        totalPages={totalPages}
                        onPrev={() => setPage((p) => Math.max(0, p - 1))}
                        onNext={() => setPage((p) => p + 1)}
                    />
                )}
            </CardContent>
        </Card>
    );
}

function ItemsTab() {
    const listFn = useServerFn(getOrderItemsList);
    const syncVersion = useSyncVersion();
    const [rows, setRows] = useState<OrderItemListRow[]>([]);
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
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">Order Items ({total})</CardTitle>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Search item or reference…"
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
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState title="No order items" description="No imported order item records found." />
                ) : (
                    <DataTable
                        headers={[
                            "Item Name",
                            "Category",
                            "Qty",
                            "Unit Price",
                            "Line Total",
                            "Payment",
                            "Status",
                        ]}
                        rows={rows.map((it) => [
                            it.itemName,
                            it.category ?? "—",
                            String(it.quantity),
                            money(it.unitPriceCents, it.currency),
                            money(it.lineTotalCents, it.currency),
                            <Badge variant="outline" className="text-[10px]">
                                {it.paymentStatus}
                            </Badge>,
                            <Badge variant="secondary" className="text-[10px]">
                                {it.status}
                            </Badge>,
                        ])}
                        page={page}
                        totalPages={totalPages}
                        onPrev={() => setPage((p) => Math.max(0, p - 1))}
                        onNext={() => setPage((p) => p + 1)}
                    />
                )}
            </CardContent>
        </Card>
    );
}

function DataTable({
    headers,
    rows,
    page,
    totalPages,
    onPrev,
    onNext,
}: {
    headers: string[];
    rows: React.ReactNode[][];
    page: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
}) {
    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            {headers.map((h) => (
                                <th key={h} className="pb-2 pr-4 font-medium last:pr-0">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                                {r.map((cell, j) => (
                                    <td key={j} className="py-2.5 pr-4 text-foreground last:pr-0">
                                        {cell}
                                    </td>
                                ))}
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
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
                        Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
                        Next
                    </Button>
                </div>
            </div>
        </>
    );
}
