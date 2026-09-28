import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getCustomersList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";
import type { CustomerListItem } from "@/lib/integration/types";

const PAGE_SIZE = 15;

export function CustomersPage() {
    const listFn = useServerFn(getCustomersList);
    const syncVersion = useSyncVersion();
    const [rows, setRows] = useState<CustomerListItem[]>([]);
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
                title="Customers"
                description="Customer-level purchasing information from synced orders"
            />

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">Customers ({total})</CardTitle>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search by Clover ID or CRM contact…"
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
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading customers…
                        </div>
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title="No customers yet"
                            description="Customer records appear once orders with attached customers are synced."
                        />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th className="pb-2 pr-4 font-medium">Clover Customer ID</th>
                                            <th className="pb-2 pr-4 font-medium">CRM Contact</th>
                                            <th className="pb-2 pr-4 font-medium">Orders</th>
                                            <th className="pb-2 pr-4 font-medium">Total Spend</th>
                                            <th className="pb-2 pr-4 font-medium">Avg Order</th>
                                            <th className="pb-2 font-medium">Last Visit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((c) => (
                                            <tr key={c.cloverCustomerId} className="border-b border-border/50">
                                                <td className="py-2.5 pr-4 font-medium text-foreground">
                                                    {c.cloverCustomerId}
                                                </td>
                                                <td className="py-2.5 pr-4 text-muted-foreground">
                                                    {c.ghlContactId ? (
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {c.matchedBy ?? "linked"}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-xs">unmatched</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-4 text-foreground">{c.orderCount}</td>
                                                <td className="py-2.5 pr-4 text-foreground">{money(c.totalSpendCents)}</td>
                                                <td className="py-2.5 pr-4 text-foreground">
                                                    {money(c.orderCount ? Math.round(c.totalSpendCents / c.orderCount) : 0)}
                                                </td>
                                                <td className="py-2.5 text-muted-foreground">
                                                    <span title={formatDateTime(c.lastVisitMs)}>
                                                        {relativeTime(c.lastVisitMs)}
                                                    </span>
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

// Route alias: admin.customer-purchases.tsx imports CustomerPurchasesPage.
export { CustomersPage as CustomerPurchasesPage };
