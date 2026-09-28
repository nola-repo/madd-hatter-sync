import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert, TrendingUp, ShoppingCart, Users, Package, DollarSign } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getDashboard } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type { DashboardStats } from "@/lib/integration/types";

type HomeRange = "today" | "week" | "month";

export function DashboardPage() {
    const getDashboardFn = useServerFn(getDashboard);
    const syncVersion = useSyncVersion();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [range, setRange] = useState<HomeRange>("month");

    const load = async (activeRange: HomeRange = range) => {
        setLoading(true);
        setError(null);
        try {
            const res = await getDashboardFn({ data: { range: activeRange } });
            if (res?.setupRequired) {
                setError(`Setup required: ${(res as any).missing?.join(", ")}`);
            } else {
                setStats(res.stats);
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to load dashboard");
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when the range changes OR after a global sync completes.
    useEffect(() => {
        load(range);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, syncVersion]);

    if (loading) {
        return (
            <div>
                <PageHeader title="Dashboard" description="Business overview of your POS data" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <PageHeader title="Dashboard" description="Business overview of your POS data" />
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
                    title="Home"
                    description="Here's an overview of how your business is doing"
                    actions={<RangeSelector range={range} onChange={(r) => setRange(r as HomeRange)} />}
                />
                <EmptyState
                    title="No POS data available yet"
                    description="Go to Settings → POS Data Synchronization and click “Sync / Refresh Clover Data” to pull your latest Clover orders, customers, payments, and items. Sales totals, top products, and customer activity will appear here once data is imported."
                />
            </div>
        );
    }

    const rangeLabel = range === "today" ? "Today" : range === "week" ? "This Week" : "This Month";
    const displaySales = stats.filteredSalesCents ?? stats.totalSalesCents;
    const displayOrders = stats.filteredOrdersCount ?? stats.totalOrders;
    const displayCustomers = stats.filteredCustomersCount ?? stats.totalCustomers;
    const displayItems = stats.filteredItemsSoldCount ?? stats.totalItemsSold;

    const cards = [
        {
            label: `${rangeLabel} Sales`,
            value: money(displaySales),
            icon: DollarSign,
            sub: `${stats.filteredPaidOrdersCount ?? stats.totalOrders} paid orders`,
        },
        {
            label: `${rangeLabel} Orders`,
            value: String(displayOrders),
            icon: ShoppingCart,
            sub: `for ${rangeLabel.toLowerCase()}`,
        },
        {
            label: "Customers",
            value: String(displayCustomers),
            icon: Users,
            sub: `active ${rangeLabel.toLowerCase()}`,
        },
        {
            label: "Items Sold",
            value: String(displayItems),
            icon: Package,
            sub: `units ${rangeLabel.toLowerCase()}`,
        },
    ];

    return (
        <div>
            <PageHeader
                title="Home"
                description="Here's an overview of how your business is doing"
                actions={<RangeSelector range={range} onChange={(r) => setRange(r as HomeRange)} />}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((c) => {
                    const Icon = c.icon;
                    return (
                        <Card key={c.label}>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">{c.label}</span>
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="mt-2 text-2xl font-bold text-foreground">{c.value}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">Average Order Size</span>
                        <div className="mt-2 text-2xl font-bold text-foreground">
                            {money(stats.filteredAverageOrderValueCents ?? stats.averageOrderValueCents)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Across {stats.filteredPaidOrdersCount ?? stats.totalOrders} paid orders in{" "}
                            {rangeLabel.toLowerCase()}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <span className="text-sm font-medium text-muted-foreground">Top Category</span>
                        <div className="mt-2 text-xl font-bold text-foreground">
                            {stats.topCategories[0]?.name ?? "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {stats.topCategories[0]?.revenueCents
                                ? `${money(stats.topCategories[0].revenueCents)} revenue in ${rangeLabel.toLowerCase()}`
                                : "No category sales yet"}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <TrendingUp className="h-4 w-4 text-primary" /> Top Selling Items
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.topItems.length === 0 && (
                                <p className="text-sm text-muted-foreground">No items sold yet.</p>
                            )}
                            {stats.topItems.map((it, i) => (
                                <div key={it.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                            {i + 1}
                                        </span>
                                        <div>
                                            <div className="text-sm font-medium text-foreground">{it.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {it.category ?? "Uncategorized"} · {it.quantity} sold
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-sm font-medium text-foreground">
                                        {money(it.revenueCents)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Recent Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.recentOrders.length === 0 && (
                                <p className="text-sm text-muted-foreground">No orders yet.</p>
                            )}
                            {stats.recentOrders.map((o) => (
                                <div key={o.id} className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">{o.cloverOrderId}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {formatDateTime(o.createdTime)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-medium text-foreground">
                                            {money(o.totalCents, o.currency)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{o.paymentStatus}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Top Categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.topCategories.length === 0 && (
                                <p className="text-sm text-muted-foreground">No category data yet.</p>
                            )}
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
        </div>
    );
}

function RangeSelector({
    range,
    onChange,
}: {
    range: HomeRange;
    onChange: (r: HomeRange) => void;
}) {
    return (
        <Select value={range} onValueChange={(v) => onChange(v as HomeRange)}>
            <SelectTrigger className="w-[160px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
        </Select>
    );
}
