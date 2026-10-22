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
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Loader2,
    RefreshCw,
    Search,
    Receipt,
    ExternalLink,
    Filter,
    DollarSign,
    CheckCircle2,
    AlertCircle,
    Clock,
    User,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    Tag,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrdersList, getOrderDetailFn } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";
import type { OrderListItem, OrderDetailRow } from "@/lib/integration/types";

const PAGE_SIZE = 50;
const CRM_LOCATION_ID = "7biYjalPZzmmvKaLw0WN";

function crmContactUrl(contactId: string) {
    return `https://app.gohighlevel.com/sub-account/${CRM_LOCATION_ID}/contacts/${contactId}`;
}

export function OrdersPage() {
    const listFn = useServerFn(getOrdersList);
    const getOrderDetailServerFn = useServerFn(getOrderDetailFn);
    const syncVersion = useSyncVersion();
    const { bump } = useSyncContext();

    const [rows, setRows] = useState<OrderListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [paymentStatus, setPaymentStatus] = useState<string>("all");
    const [syncFilter, setSyncFilter] = useState<string>("all");
    const [page, setPage] = useState(0);

    // Selected order for detail drawer
    const [selectedOrder, setSelectedOrder] = useState<OrderListItem | null>(null);
    const [orderDetail, setOrderDetail] = useState<OrderDetailRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

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
        } catch (e) {
            console.error("Failed to load orders:", e);
        } finally {
            setLoading(false);
        }
    }, [listFn, search, paymentStatus, page]);

    useEffect(() => {
        load();
    }, [load, syncVersion]);

    // Client-side sync status filter on current page slice
    const filteredRows = rows.filter((r) => {
        if (syncFilter === "all") return true;
        if (syncFilter === "synced") return r.status === "synced";
        if (syncFilter === "pending") return r.status === "pending" || r.status === "in_progress";
        if (syncFilter === "held") return r.status === "held_for_review";
        if (syncFilter === "error") return r.status === "error";
        return true;
    });

    // Compute summary metrics for current loaded set
    const totalSalesCurrent = rows.reduce((sum, r) => sum + (r.totalCents || 0), 0);
    const syncedCount = rows.filter((r) => r.status === "synced").length;
    const attentionCount = rows.filter((r) => r.status === "held_for_review" || r.status === "error").length;

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleSelectOrder = async (order: OrderListItem) => {
        setSelectedOrder(order);
        setDetailLoading(true);
        try {
            const res = await getOrderDetailServerFn({ data: { orderId: order.cloverOrderId } });
            if (!res.setupRequired) {
                setOrderDetail(res.detail);
            }
        } catch (e) {
            console.error("Error loading order detail:", e);
        } finally {
            setDetailLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Orders"
                description="Live transaction registry synchronized from Clover POS with GoHighLevel CRM contact matching."
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            bump();
                            load();
                        }}
                        disabled={loading}
                        className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
                    >
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`} />
                        Refresh Data
                    </Button>
                }
            />

            {/* Summary Metrics Strip */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Total Matched Orders</span>
                            <Receipt className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-white">
                            {loading ? <Skeleton className="h-8 w-24 bg-zinc-800" /> : total.toLocaleString()}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">
                            Synchronized transactions
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Current View Volume</span>
                            <DollarSign className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-white">
                            {loading ? <Skeleton className="h-8 w-28 bg-zinc-800" /> : money(totalSalesCurrent)}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">
                            Across {rows.length} loaded records
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>CRM Synced in View</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
                            {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : syncedCount}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">
                            Contact & tags dispatched
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                            <span>Requires Attention</span>
                            <AlertCircle className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
                            {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : attentionCount}
                        </div>
                        <div className="mt-1 text-[11px] text-[#71717A]">
                            Held or review required
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Table Card */}
            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-sm font-semibold text-white font-display">
                                Transaction Explorer
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 bg-zinc-900/60">
                                {total} Total
                            </Badge>
                        </div>

                        {/* Search and Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                                <Input
                                    placeholder="Search by order ID…"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(0);
                                    }}
                                    className="h-8 w-44 sm:w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B]"
                                />
                            </div>

                            <Select
                                value={paymentStatus}
                                onValueChange={(v) => {
                                    setPaymentStatus(v);
                                    setPage(0);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[130px] border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]">
                                    <SelectValue placeholder="Payment" />
                                </SelectTrigger>
                                <SelectContent className="border-[#27272A] bg-[#141417] text-[#E4E4E7]">
                                    <SelectItem value="all">All Payments</SelectItem>
                                    <SelectItem value="PAID">Paid</SelectItem>
                                    <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                                    <SelectItem value="OPEN">Open</SelectItem>
                                    <SelectItem value="REFUNDED">Refunded</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={syncFilter}
                                onValueChange={(v) => setSyncFilter(v)}
                            >
                                <SelectTrigger className="h-8 w-[130px] border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]">
                                    <SelectValue placeholder="Sync Status" />
                                </SelectTrigger>
                                <SelectContent className="border-[#27272A] bg-[#141417] text-[#E4E4E7]">
                                    <SelectItem value="all">All Outcomes</SelectItem>
                                    <SelectItem value="synced">Synced to GHL</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="held">Held for Review</SelectItem>
                                    <SelectItem value="error">Error</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <TableSkeleton rows={7} columns={8} />
                    ) : filteredRows.length === 0 ? (
                        <div className="p-8 text-center">
                            <EmptyState
                                title="No matching orders"
                                description="Try adjusting your search criteria or payment status filter."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                        <th className="py-3 px-4 font-medium">Order ID</th>
                                        <th className="py-3 px-4 font-medium">Date & Time</th>
                                        <th className="py-3 px-4 font-medium">Customer / Guest</th>
                                        <th className="py-3 px-4 font-medium">Total</th>
                                        <th className="py-3 px-4 font-medium">Payment</th>
                                        <th className="py-3 px-4 font-medium">Sync State</th>
                                        <th className="py-3 px-4 font-medium">GHL Contact</th>
                                        <th className="py-3 px-4 text-right font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1A1A1E]">
                                    {filteredRows.map((o) => (
                                        <tr
                                            key={o.id}
                                            onClick={() => handleSelectOrder(o)}
                                            className="hover:bg-[#161619] cursor-pointer transition-colors group"
                                        >
                                            <td className="py-3 px-4 font-mono font-medium text-white group-hover:text-zinc-200 transition-colors">
                                                {o.cloverOrderId}
                                            </td>
                                            <td className="py-3 px-4 text-[#A1A1AA]">
                                                {formatDateTime(o.createdTime)}
                                            </td>
                                            <td className="py-3 px-4 text-[#D4D4D8]">
                                                {o.cloverCustomerId ? (
                                                    <span className="font-mono text-[11px] text-[#A1A1AA]">
                                                        {o.cloverCustomerId}
                                                    </span>
                                                ) : (
                                                    <span className="text-[#52525B]">Walk-in Guest</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-medium text-white">
                                                {money(o.totalCents, o.currency)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge
                                                    variant="outline"
                                                    className="border-zinc-700 bg-zinc-900/60 text-[10px]"
                                                >
                                                    {o.paymentStatus}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4">
                                                <SyncStatusBadge status={o.status} />
                                            </td>
                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                {o.ghlContactId ? (
                                                    <a
                                                        href={crmContactUrl(o.ghlContactId)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-blue-400 hover:underline inline-flex items-center gap-1"
                                                    >
                                                        {o.ghlContactId.slice(0, 8)}…
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                    </a>
                                                ) : (
                                                    <span className="text-[#52525B]">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-[11px] text-[#A1A1AA] hover:text-white hover:bg-zinc-800"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectOrder(o);
                                                    }}
                                                >
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[#1E1E22] px-4 py-3 bg-[#0E0E10]">
                        <span className="text-xs text-[#71717A]">
                            Showing {filteredRows.length} of {total} orders · Page {page + 1} of {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 0 || loading}
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7] hover:bg-[#1E1E24]"
                            >
                                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages - 1 || loading}
                                onClick={() => setPage((p) => p + 1)}
                                className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7] hover:bg-[#1E1E24]"
                            >
                                Next
                                <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Slide-Over Sheet */}
            <Sheet
                open={!!selectedOrder}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedOrder(null);
                        setOrderDetail(null);
                    }
                }}
            >
                <SheetContent className="w-full sm:max-w-xl bg-[#0E0E11] border-[#222226] text-[#F5F5F5] p-6 overflow-y-auto">
                    <SheetHeader className="pb-4 border-b border-[#222226]">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-zinc-300 font-semibold">
                                Clover Order
                            </span>
                            <span className="text-xs text-[#71717A]">·</span>
                            <span className="font-mono text-xs text-[#A1A1AA]">
                                {selectedOrder?.cloverOrderId}
                            </span>
                        </div>
                        <SheetTitle className="text-xl font-bold font-display text-white">
                            Transaction & Synchronization Detail
                        </SheetTitle>
                        <SheetDescription className="text-xs text-[#71717A]">
                            Synchronized record with financial reconciliation and CRM contact mapping.
                        </SheetDescription>
                    </SheetHeader>

                    {detailLoading ? (
                        <div className="py-16 text-center text-xs text-[#A1A1AA]">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-300" />
                            Retrieving detailed item breakdown…
                        </div>
                    ) : orderDetail ? (
                        <div className="mt-6 space-y-6">
                            {/* Financial Summary Card */}
                            <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 space-y-3">
                                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-display flex items-center justify-between">
                                    <span>Financial Breakdown</span>
                                    <Badge variant="outline" className="border-zinc-700 text-[10px]">
                                        {orderDetail.order.paymentStatus}
                                    </Badge>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between text-[#A1A1AA]">
                                        <span>Subtotal:</span>
                                        <span className="font-mono text-white">
                                            {money(orderDetail.order.subtotalCents, orderDetail.order.currency)}
                                        </span>
                                    </div>
                                    {orderDetail.order.discountTotalCents > 0 && (
                                        <div className="flex justify-between text-[#A1A1AA]">
                                            <span>Discounts:</span>
                                            <span className="font-mono text-red-400">
                                                -{money(orderDetail.order.discountTotalCents, orderDetail.order.currency)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetail.order.taxTotalCents > 0 && (
                                        <div className="flex justify-between text-[#A1A1AA]">
                                            <span>Tax:</span>
                                            <span className="font-mono text-white">
                                                {money(orderDetail.order.taxTotalCents, orderDetail.order.currency)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetail.order.tipCents > 0 && (
                                        <div className="flex justify-between text-[#A1A1AA]">
                                            <span>Tip Amount:</span>
                                            <span className="font-mono text-emerald-400">
                                                +{money(orderDetail.order.tipCents, orderDetail.order.currency)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetail.order.serviceChargeCents > 0 && (
                                        <div className="flex justify-between text-[#A1A1AA]">
                                            <span>Service Charge:</span>
                                            <span className="font-mono text-white">
                                                +{money(orderDetail.order.serviceChargeCents, orderDetail.order.currency)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="border-t border-[#222226] pt-2 flex justify-between font-bold text-sm text-white">
                                        <span>Total Amount:</span>
                                        <span className="font-mono text-lg text-white">
                                            {money(orderDetail.order.totalCents, orderDetail.order.currency)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* CRM Identity Verification */}
                            <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 space-y-3">
                                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-display">
                                    GoHighLevel CRM Matching
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="text-[#71717A]">Clover Customer ID:</span>
                                        <div className="font-mono text-[#D4D4D8] mt-0.5">
                                            {orderDetail.order.cloverCustomerId ?? "Anonymous Walk-in"}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[#71717A]">Matched GHL Contact:</span>
                                        <div className="font-mono mt-0.5">
                                            {orderDetail.order.ghlContactId ? (
                                                <a
                                                    href={crmContactUrl(orderDetail.order.ghlContactId)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                                                >
                                                    {orderDetail.order.ghlContactId}
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            ) : (
                                                <span className="text-[#71717A]">No CRM match recorded</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[11px] text-[#71717A] border-t border-[#1E1E22] pt-2">
                                    Synchronization Status:{" "}
                                    <span className="text-white font-medium capitalize">
                                        {orderDetail.order.status}
                                    </span>
                                </div>
                            </div>

                            {/* Line Items List */}
                            <div>
                                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2 font-display">
                                    Line Items ({orderDetail.items.length})
                                </div>
                                <div className="rounded-xl border border-[#222226] divide-y divide-[#1E1E22] bg-[#141417] overflow-hidden">
                                    {orderDetail.items.map((item) => (
                                        <div key={item.id} className="p-3 text-xs space-y-1">
                                            <div className="flex justify-between items-center">
                                                <div className="font-medium text-white flex items-center gap-2">
                                                    <span className="text-emerald-400 font-mono font-bold">
                                                        {item.quantity}×
                                                    </span>
                                                    {item.name}
                                                </div>
                                                <div className="font-mono text-white">
                                                    {money(item.priceCents * item.quantity)}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-[#71717A]">
                                                <span>Category: {item.category ?? "Uncategorized"}</span>
                                                <span>{money(item.priceCents)} each</span>
                                            </div>
                                            {item.modifiers && (
                                                <div className="text-[10px] text-amber-400/90 pl-4 border-l border-[#27272A] mt-1">
                                                    Modifiers: {item.modifiers}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Audit Metadata */}
                            <div className="rounded-xl border border-[#222226] bg-[#0E0E10] p-3 text-[11px] text-[#71717A] space-y-1">
                                <div>Order Time: {formatDateTime(orderDetail.order.createdTime)}</div>
                                <div>Employee / Server: {orderDetail.order.cloverEmployeeId ?? "Default Staff"}</div>
                                <div>Location: {orderDetail.order.locationName ?? "Madd Hatter Hoboken"}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-12 text-center text-xs text-[#71717A]">
                            No detail records found for this transaction.
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function SyncStatusBadge({ status }: { status: string }) {
    if (status === "synced") {
        return (
            <Badge
                variant="outline"
                className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
            >
                Synced
            </Badge>
        );
    }
    if (status === "held_for_review") {
        return (
            <Badge
                variant="outline"
                className="border-amber-800/40 bg-amber-950/40 text-amber-400 text-[10px]"
            >
                Review Held
            </Badge>
        );
    }
    if (status === "error") {
        return (
            <Badge
                variant="outline"
                className="border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
            >
                Sync Error
            </Badge>
        );
    }
    if (status === "in_progress") {
        return (
            <Badge
                variant="outline"
                className="border-blue-800/40 bg-blue-950/40 text-blue-400 text-[10px] animate-pulse"
            >
                Syncing…
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]">
            Pending
        </Badge>
    );
}
