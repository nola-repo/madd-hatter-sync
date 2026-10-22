import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Layers,
  BarChart3,
  ArrowUpRight,
  Sparkles,
  Calendar,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { getDashboard, getReconciliation } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";
import type { DashboardStats } from "@/lib/integration/types";

type Range = "today" | "week" | "month" | "all";

export function AnalyticsPage() {
  const getDashboardFn = useServerFn(getDashboard);
  const getReconciliationFn = useServerFn(getReconciliation);
  const syncVersion = useSyncVersion();
  const { bump } = useSyncContext();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recon, setRecon] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, reconRes] = await Promise.all([
        getDashboardFn({ data: { range } }),
        getReconciliationFn().catch(() => null),
      ]);

      if (dashRes?.setupRequired) {
        setError(`Setup required: ${(dashRes as any).missing?.join(", ")}`);
      } else {
        setStats(dashRes.stats);
      }

      if (reconRes && !reconRes.setupRequired) {
        setRecon(reconRes.runs);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [getDashboardFn, getReconciliationFn, range]);

  useEffect(() => {
    load();
  }, [load, syncVersion]);

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-64 bg-zinc-900" />
          <Skeleton className="h-9 w-36 bg-zinc-900" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-zinc-900" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl bg-zinc-900" />
          <Skeleton className="h-72 rounded-xl bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Analytics" description="Business intelligence workspace" />
        <Alert variant="destructive" className="border-red-900/50 bg-red-950/20 text-red-200">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!stats || !stats.hasData) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Hospitality sales intelligence and synchronization reconciliation"
        />
        <EmptyState
          title="No analytics recorded"
          description="Sales trends, category breakdowns, and audit comparisons appear once orders are ingested."
        />
      </div>
    );
  }

  const rangeLabel =
    range === "today"
      ? "Today"
      : range === "week"
        ? "This Week"
        : range === "month"
          ? "This Month"
          : "All Time";

  const displaySales = stats.filteredSalesCents ?? stats.totalSalesCents;
  const displayOrders = stats.filteredOrdersCount ?? stats.totalOrders;
  const displayAov = stats.filteredAverageOrderValueCents ?? stats.averageOrderValueCents;
  const displayItems = stats.filteredItemsSoldCount ?? stats.totalItemsSold;

  const topCategory = stats.topCategories[0];
  const topItem = stats.topItems[0];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header with Range Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
            Business Intelligence
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Hospitality sales analytics, product velocity, and POS-to-CRM reconciliation audit.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="h-9 w-[130px] border-[#27272A] bg-[#141417] text-xs text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#27272A] bg-[#141417] text-white">
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              bump();
              load();
            }}
            disabled={loading}
            className="h-9 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7] hover:bg-[#1E1E24]"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>{rangeLabel} Revenue</span>
              <DollarSign className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {money(displaySales)}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Net hospitality sales</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Order Volume</span>
              <ShoppingCart className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {displayOrders.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Paid guest checks</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Average Check (AOV)</span>
              <TrendingUp className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">{money(displayAov)}</div>
            <div className="mt-1 text-[11px] text-[#71717A]">Per settled transaction</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Units Sold</span>
              <Package className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {displayItems.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Menu items dispensed</div>
          </CardContent>
        </Card>
      </div>

      {/* Strategic Insight Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#222226] bg-[#0E0E11] p-4">
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-display font-medium">
            <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
            Leading Revenue Stream
          </div>
          <div className="mt-2 text-base font-bold text-white font-display">
            {topCategory ? topCategory.name : "—"}
          </div>
          <div className="mt-1 text-xs font-mono text-emerald-400">
            {topCategory ? `${money(topCategory.revenueCents)} generated` : "No sales data"}
          </div>
        </Card>

        <Card className="border-[#222226] bg-[#0E0E11] p-4">
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-display font-medium">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Top Menu Favorite
          </div>
          <div className="mt-2 text-base font-bold text-white font-display truncate">
            {topItem ? topItem.name : "—"}
          </div>
          <div className="mt-1 text-xs text-[#A1A1AA]">
            {topItem
              ? `${topItem.quantity} units · ${money(topItem.revenueCents)}`
              : "No items sold"}
          </div>
        </Card>

        <Card className="border-[#222226] bg-[#0E0E11] p-4">
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-display font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            Sync Reconciliation
          </div>
          <div className="mt-2 text-base font-bold text-white font-display">
            {recon && recon[0]?.status === "completed" ? "Fidelity Confirmed" : "Audit Active"}
          </div>
          <div className="mt-1 text-xs text-[#71717A]">
            {recon && recon[0]
              ? `${recon[0].ordersUpserted} records reconciled`
              : "No recent sync runs"}
          </div>
        </Card>
      </div>

      {/* Visual Breakdown Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Categories Breakdown */}
        <Card className="border-[#222226] bg-[#111113]">
          <CardHeader className="pb-3 border-b border-[#1E1E22]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-400" />
                Revenue by Category
              </CardTitle>
              <span className="text-xs text-[#71717A]">{rangeLabel}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {stats.topCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No category revenue found.
                </p>
              ) : (
                stats.topCategories.map((c, i) => {
                  const max = stats.topCategories[0]?.revenueCents || 1;
                  const pct = Math.round((c.revenueCents / max) * 100);
                  return (
                    <div key={c.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="font-mono text-[#A1A1AA]">{money(c.revenueCents)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#1A1A1E]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              i === 0
                                ? "#E4E4E7"
                                : i === 1
                                  ? "#A1A1AA"
                                  : i === 2
                                    ? "#71717A"
                                    : "#52525B",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Items */}
        <Card className="border-[#222226] bg-[#111113]">
          <CardHeader className="pb-3 border-b border-[#1E1E22]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-400" />
                Top Menu Velocity
              </CardTitle>
              <span className="text-xs text-[#71717A]">Units Dispensed</span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {stats.topItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No item sales found.
                </p>
              ) : (
                stats.topItems.map((it) => {
                  const max = stats.topItems[0]?.quantity || 1;
                  const pct = Math.round((it.quantity / max) * 100);
                  return (
                    <div key={it.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium text-white truncate">{it.name}</span>
                          <span className="text-[10px] text-[#71717A]">
                            ({it.category ?? "Uncategorized"})
                          </span>
                        </div>
                        <div className="font-mono text-[#A1A1AA] shrink-0">
                          {it.quantity} sold · {money(it.revenueCents)}
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#1A1A1E]">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Panel — Clover POS vs Middleware Audit */}
      {recon && recon.length > 0 && (
        <Card className="border-[#222226] bg-[#111113] shadow-lg">
          <CardHeader className="pb-3 border-b border-[#1E1E22]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-zinc-400" />
                Clover POS Synchronization Reconciliation
              </CardTitle>
              <span className="text-xs text-[#71717A]">Audit log: last 5 ingestions</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                    <th className="py-3 px-4 font-medium">Execution Run</th>
                    <th className="py-3 px-4 font-medium">Outcome</th>
                    <th className="py-3 px-4 font-medium">Range Scope</th>
                    <th className="py-3 px-4 font-medium">Orders Upserted</th>
                    <th className="py-3 px-4 font-medium">Net Sales</th>
                    <th className="py-3 px-4 font-medium">Refund Amount</th>
                    <th className="py-3 px-4 font-medium">Units Stored</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1E]">
                  {recon.map((r: any) => {
                    const rec = r.reconciliation;
                    return (
                      <tr key={r.runId} className="hover:bg-[#161619] transition-colors">
                        <td className="py-3 px-4 text-[#A1A1AA] font-mono">
                          {r.startedAt ? formatDateTime(new Date(r.startedAt).getTime()) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={
                              r.status === "completed"
                                ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                : "border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-white">
                          {rec?.rangeLabel ?? "Standard Ingestion"}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-white">
                          {rec
                            ? `${rec.paidOrderCount} paid / ${rec.ordersFetched} fetched`
                            : `${r.ordersUpserted} orders`}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {rec ? money(rec.netSalesCents) : "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-red-400">
                          {rec && rec.refundAmountCents > 0
                            ? money(rec.refundAmountCents)
                            : "$0.00"}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
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
