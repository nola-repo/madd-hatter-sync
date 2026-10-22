import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { getTransactionsList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type { TransactionRow } from "@/lib/integration/types";

const PAGE_SIZE = 25;

export function TransactionsPage() {
    const listFn = useServerFn(getTransactionsList);
    const syncVersion = useSyncVersion();
    const { bump } = useSyncContext();

    const [rows, setRows] = useState<TransactionRow[]>([]);
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
        <div className="space-y-6">
            <PageHeader
                title="Tender & Payments"
                description="Synchronized Clover payment records, credit card auths, and gratuity distributions."
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
                        Refresh
                    </Button>
                }
            />

            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-zinc-400" />
                            <CardTitle className="text-sm font-semibold text-white font-display">
                                Payment Ledger ({total})
                            </CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                                <Input
                                    placeholder="Search payment or order ID…"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(0);
                                    }}
                                    className="h-8 w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <TableSkeleton rows={7} columns={7} />
                    ) : rows.length === 0 ? (
                        <div className="p-8 text-center">
                            <EmptyState
                                title="No transactions recorded"
                                description="Transactions appear here once Clover payments are ingested."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                        <th className="py-3 px-4 font-medium">Payment ID</th>
                                        <th className="py-3 px-4 font-medium">Order ID</th>
                                        <th className="py-3 px-4 font-medium">Date</th>
                                        <th className="py-3 px-4 font-medium">Amount</th>
                                        <th className="py-3 px-4 font-medium">Tip</th>
                                        <th className="py-3 px-4 font-medium">Type</th>
                                        <th className="py-3 px-4 font-medium">Result</th>
                                        <th className="py-3 px-4 font-medium">Card Brand</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1A1A1E]">
                                    {rows.map((t) => (
                                        <tr key={t.cloverPaymentId} className="hover:bg-[#161619] transition-colors">
                                            <td className="py-3 px-4 font-mono text-[11px] font-medium text-white">
                                                {t.cloverPaymentId}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-[11px] text-[#A1A1AA]">
                                                {t.cloverOrderId ?? "—"}
                                            </td>
                                            <td className="py-3 px-4 text-[#A1A1AA]">
                                                {formatDateTime(t.date)}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-medium text-white">
                                                {money(t.amountCents, t.currency)}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-emerald-400">
                                                {t.tipCents ? money(t.tipCents, t.currency) : "—"}
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge variant="outline" className="text-[10px] border-zinc-700 bg-zinc-900/60">
                                                    {t.paymentType ?? "Card"}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        t.result === "SUCCESS"
                                                            ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                            : "border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
                                                    }
                                                >
                                                    {t.result ?? "SUCCESS"}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-[#D4D4D8] capitalize">
                                                {t.cardType ?? "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[#1E1E22] px-4 py-3 bg-[#0E0E10]">
                            <span className="text-xs text-[#71717A]">
                                Page {page + 1} of {totalPages} · {total} payments
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 0 || loading}
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages - 1 || loading}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]"
                                >
                                    Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
