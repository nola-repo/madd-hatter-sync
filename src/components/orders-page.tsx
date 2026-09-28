import { useCallback, useEffect, useState } from "react";
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
import { Loader2, RefreshCw, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getOrdersList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type { OrderListItem } from "@/lib/integration/types";

const PAGE_SIZE = 50;

export function OrdersPage() {
    const listFn = useServerFn(getOrdersList);
    const syncVersion = useSyncVersion();

    const [rows, setRows] = useState<OrderListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [paymentStatus, setPaymentStatus] = useState<string>("all");
    const [page, setPage] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listFn({
                data: {
                    search: search || undefined,
                    paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
                    limit: PAGE_SIZE,
                    offset: page * PAGE_SIZE,
                },
            });
            if (res?.setupRequired) return;
            setRows(res.rows);
            setTotal(res.total);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, [listFn, search, paymentStatus, page]);

    useEffect(() => {
        load();
    }, [load, syncVersion]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            <PageHeader
                title="Orders"
                description="Synchronized Clover orders — sync fresh data from Settings"
            />

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">Orders ({total})</CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search order ID…"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(0);
                                    }}
                                    className="h-8 w-48 pl-8"
                                />
                            </div>
                            <Select
                                value={paymentStatus}
                                onValueChange={(v) => {
                                    setPaymentStatus(v);
                                    setPage(0);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[150px]">
                                    <SelectValue placeholder="Payment status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="PAID">Paid</SelectItem>
                                    <SelectItem value="PARTIALLY_PAID">Partially paid</SelectItem>
                                    <SelectItem value="OPEN">Open</SelectItem>
                                    <SelectItem value="REFUNDED">Refunded</SelectItem>
                                </SelectContent>
                            </Select>
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
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
                        </div>
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title="No orders yet"
                            description="Click “Refresh POS Data” above to pull your latest Clover orders into the dashboard."
                        />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th className="pb-2 pr-4 font-medium">Order ID</th>
                                            <th className="pb-2 pr-4 font-medium">Date / Time</th>
                                            <th className="pb-2 pr-4 font-medium">Customer</th>
                                            <th className="pb-2 pr-4 font-medium">Total</th>
                                            <th className="pb-2 pr-4 font-medium">Payment</th>
                                            <th className="pb-2 pr-4 font-medium">Sync Status</th>
                                            <th className="pb-2 font-medium">CRM Contact</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((o) => (
                                            <tr key={o.id} className="border-b border-border/50">
                                                <td className="py-2.5 pr-4 font-mono font-medium text-foreground">
                                                    {o.cloverOrderId}
                                                </td>
                                                <td className="py-2.5 pr-4 text-muted-foreground">
                                                    {formatDateTime(o.createdTime)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-muted-foreground">
                                                    {o.cloverCustomerId ?? "—"}
                                                </td>
                                                <td className="py-2.5 pr-4 text-foreground">
                                                    {money(o.totalCents, o.currency)}
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {o.paymentStatus}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                    <SyncStatusBadge status={o.status} />
                                                </td>
                                                <td className="py-2.5 font-mono text-[11px] text-muted-foreground">
                                                    {o.ghlContactId ?? "—"}
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

function SyncStatusBadge({ status }: { status: string }) {
    const variant =
        status === "synced"
            ? "default"
            : status === "held_for_review"
                ? "secondary"
                : status === "error"
                    ? "destructive"
                    : "outline";
    const label =
        status === "synced"
            ? "Synced"
            : status === "held_for_review"
                ? "Held"
                : status === "error"
                    ? "Error"
                    : status === "in_progress"
                        ? "Syncing"
                        : "Pending";
    return (
        <Badge variant={variant} className="text-[10px]">
            {label}
        </Badge>
    );
}
