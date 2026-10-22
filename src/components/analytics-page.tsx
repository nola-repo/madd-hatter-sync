import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { getDashboard, getReconciliation } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money } from "@/lib/integration/format";
import type { DashboardStats } from "@/lib/integration/types";

export function AnalyticsPage() {
    const getDashboardFn = useServerFn(getDashboard);
    const syncVersion = useSyncVersion();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const getReconciliationFn = useServerFn(getReconciliation);
    const [recon, setRecon] = useState<any[] | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getDashboardFn();
            if (res?.setupRequired) {
                setError(`Setup required: ${(res as any).missing?.join(", ")}`);
            } else {
                setStats(res.stats);
            const reconRes = await getReconciliationFn().catch(() => null);
            if (reconRes && !reconRes.setupRequired) setRecon(reconRes.runs);
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to load analytics");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncVersion]);

    if (loading) {
        return (
            <div>
                <PageHeader title="Analytics" description="Business performance insights" />
                <div className="grid gap-4 lg:grid-cols-2">
                    <Skeleton className="h-64 rounded-lg" />
                    <Skeleton className="h-64 rounded-lg" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <PageHeader title="Analytics" description="Business performance insights" />
                <Alert variant="destructive">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!stats || !stats.hasData) {
        return (
            <div>
                <PageHeader
                    title="Analytics"
                    description="Business performance insights"
                    actions={
                        <Button variant="outline" size="sm" onClick={load}>
                            <Loader2 className="mr-2 h-4 w-4" /> Refresh
                        </Button>
                    }
                />
                <EmptyState
                    title="No analytics data yet"
                    description="Sales trends, top products, and customer spending will appear once orders are synced."
                    action={
                        <Button variant="outline" size="sm" onClick={load}>
                            <Loader2 className="mr-2 h-4 w-4" /> Refresh
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="Analytics"
                description="Business performance insights"
                actions={
                    <Button variant="outline" size="sm" onClick={load}>
                        <Loader2 className="mr-2 h-4 w-4" /> Refresh
                    </Button>
                }
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">All-Time Sales</span>
                        <div className="mt-2 text-2xl font-bold text-foreground">
                            {money(stats.totalSalesCents)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">Total Orders</span>
                        <div className="mt-2 text-2xl font-bold text-foreground">{stats.totalOrders}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">Avg Order Value</span>
                        <div className="mt-2 text-2xl font-bold text-foreground">
                            {money(stats.averageOrderValueCents)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">Items Sold</span>
                        <div className="mt-2 text-2xl font-bold text-foreground">{stats.totalItemsSold}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Top Products by Quantity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.topItems.map((it) => {
                                const max = stats.topItems[0]?.quantity || 1;
                                const pct = Math.round((it.quantity / max) * 100);
                                return (
                                    <div key={it.name}>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="font-medium text-foreground">{it.name}</span>
                                            <span className="text-muted-foreground">
                                                {it.quantity} Â· {money(it.revenueCents)}
                                            </span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Top Categories by Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.topCategories.map((c) => {
                                const max = stats.topCategories[0]?.revenueCents || 1;
                                const pct = Math.round((c.revenueCents / max) * 100);
                                return (
                                    <div key={c.name}>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="font-medium text-foreground">{c.name}</span>
                                            <span className="text-muted-foreground">{money(c.revenueCents)}</span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                    <th className="pb-2 pr-4 font-medium">Order ID</th>
                                    <th className="pb-2 pr-4 font-medium">Total</th>
                                    <th className="pb-2 font-medium">Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentOrders.map((o) => (
                                    <tr key={o.id} className="border-b border-border/50">
                                        <td className="py-2.5 pr-4 font-medium text-foreground">{o.cloverOrderId}</td>
                                        <td className="py-2.5 pr-4 text-foreground">
                                            {money(o.totalCents, o.currency)}
                                        </td>
                                        <td className="py-2.5 text-muted-foreground">{o.paymentStatus}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
            {/* Reconciliation Panel — last 5 sync runs vs Clover totals */}
            {recon && recon.length > 0 && (
                <Card className="mt-4">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Sync Reconciliation</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Compares what we fetched from Clover vs what was stored. Run
                            <code className="mx-1 rounded bg-muted px-1 text-xs">/api/health</code>
                            for a full health check.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="pb-2 pr-3 font-medium">Run</th>
                                        <th className="pb-2 pr-3 font-medium">Status</th>
                                        <th className="pb-2 pr-3 font-medium">Range</th>
                                        <th className="pb-2 pr-3 font-medium">Orders</th>
                                        <th className="pb-2 pr-3 font-medium">Net Sales</th>
                                        <th className="pb-2 pr-3 font-medium">Refunds</th>
                                        <th className="pb-2 font-medium">Items Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recon.map((r: any) => {
                                        const rec = r.reconciliation;
                                        const statusIcon =
                                            r.status === "completed" ? (
                                                <CheckCircle2 className="inline h-3 w-3 text-green-500" />
                                            ) : r.status === "failed" ? (
                                                <XCircle className="inline h-3 w-3 text-destructive" />
                                            ) : (
                                                <AlertCircle className="inline h-3 w-3 text-yellow-500" />
                                            );
                                        return (
                                            <tr key={r.runId} className="border-b border-border/50">
                                                <td className="py-2 pr-3 text-muted-foreground">
                                                    {r.startedAt
                                                        ? new Date(r.startedAt).toLocaleString()
                                                        : "—"}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {statusIcon}{" "}
                                                    <span className="ml-1 capitalize">{r.status}</span>
                                                </td>
                                                <td className="py-2 pr-3 text-muted-foreground">
                                                    {rec?.rangeLabel ?? "—"}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {rec ? (
                                                        <span>
                                                            {rec.paidOrderCount} paid /{" "}
                                                            {rec.ordersFetched} fetched
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            {r.ordersUpserted} upserted
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {rec
                                                        ? `${(rec.netSalesCents / 100).toFixed(2)}`
                                                        : "—"}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {rec
                                                        ? `${(rec.refundAmountCents / 100).toFixed(2)}`
                                                        : "—"}
                                                </td>
                                                <td className="py-2">
                                                    {rec ? rec.itemsSold : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

