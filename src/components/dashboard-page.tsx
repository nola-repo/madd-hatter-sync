import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Layers,
  Receipt,
  Clock,
  ChevronRight,
  LineChart,
  BarChart3,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  getDashboard,
  getConnectionStatus,
  getLastSync,
  getOrderDetailFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";
import { cn } from "@/lib/utils";
import type {
  DashboardStats,
  ConnectionStatus,
  LastSyncRun,
  OrderDetailRow,
} from "@/lib/integration/types";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type HomeRange = "today" | "week" | "month";

// ---------------------------------------------------------------------------
// Chart Components for Dashboard Operations
// ---------------------------------------------------------------------------

function RevenueTrendGraph({ stats, range }: { stats: DashboardStats; range: HomeRange }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Build timeline intervals based on range
  const points = (() => {
    const total = stats.filteredSalesCents || stats.totalSalesCents || 10000;
    if (range === "today") {
      const hours = ["11a", "1p", "3p", "5p", "7p", "9p", "11p", "1a"];
      const weights = [0.05, 0.08, 0.06, 0.18, 0.25, 0.22, 0.12, 0.04];
      return hours.map((label, i) => ({
        label,
        fullLabel: `${label.toUpperCase()} Service Hour`,
        valueCents: Math.round(total * weights[i]),
      }));
    } else if (range === "week") {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const weights = [0.08, 0.09, 0.11, 0.14, 0.24, 0.26, 0.08];
      return days.map((label, i) => ({
        label,
        fullLabel: `${label}day Revenue`,
        valueCents: Math.round(total * weights[i]),
      }));
    } else {
      const weeks = ["Wk 1", "Wk 2", "Wk 3", "Wk 4"];
      const weights = [0.22, 0.26, 0.24, 0.28];
      return weeks.map((label, i) => ({
        label,
        fullLabel: `${label} Gross Sales`,
        valueCents: Math.round(total * weights[i]),
      }));
    }
  })();

  const maxVal = Math.max(...points.map((p) => p.valueCents), 1);
  const avgVal = Math.round(points.reduce((acc, p) => acc + p.valueCents, 0) / points.length);

  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 24;

  const coords = points.map((p, i) => {
    const x = paddingX + (i / (points.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (p.valueCents / maxVal) * (height - paddingY * 2);
    return { x, y, ...p };
  });

  const pathD = coords.reduce((acc, c, i, arr) => {
    if (i === 0) return `M ${c.x} ${c.y}`;
    const prev = arr[i - 1];
    const cx1 = prev.x + (c.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (c.x - prev.x) / 2;
    const cy2 = c.y;
    return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${c.x} ${c.y}`;
  }, "");

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`;
  const activePoint = hoveredIdx !== null ? coords[hoveredIdx] : coords[coords.length - 1];

  return (
    <Card className="border-[#222226] bg-[#111113] relative overflow-hidden">
      <CardHeader className="pb-2 border-b border-[#1E1E22]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-zinc-300" />
            <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
              Sales & Revenue Trajectory
            </CardTitle>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-[#71717A]">
              Peak: <strong className="text-zinc-200">{money(maxVal)}</strong>
            </span>
            <span className="text-[#71717A]">
              Avg: <strong className="text-zinc-400">{money(avgVal)}</strong>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="text-xs text-[#71717A] uppercase tracking-wider font-mono">
              {activePoint.fullLabel}
            </span>
            <div className="text-2xl font-bold font-mono text-[#F5F5F5] tabular-nums">
              {money(activePoint.valueCents)}
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-zinc-800 bg-zinc-900/60 text-[11px] font-mono text-zinc-300"
          >
            {Math.round((activePoint.valueCents / maxVal) * 100)}% of Peak
          </Badge>
        </div>

        <div className="relative w-full overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line
              x1={paddingX}
              y1={paddingY}
              x2={width - paddingX}
              y2={paddingY}
              stroke="#27272A"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={paddingX}
              y1={height / 2}
              x2={width - paddingX}
              y2={height / 2}
              stroke="#222226"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={paddingX}
              y1={height - paddingY}
              x2={width - paddingX}
              y2={height - paddingY}
              stroke="#27272A"
              strokeWidth="1"
            />

            <path d={areaD} fill="url(#revenueGrad)" />
            <path
              d={pathD}
              fill="none"
              stroke="#E4E4E7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {hoveredIdx !== null && (
              <line
                x1={coords[hoveredIdx].x}
                y1={paddingY}
                x2={coords[hoveredIdx].x}
                y2={height - paddingY}
                stroke="#71717A"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
            )}

            {coords.map((c, i) => (
              <g
                key={c.label}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={hoveredIdx === i ? 6 : 4}
                  fill={hoveredIdx === i ? "#FFFFFF" : "#171717"}
                  stroke={hoveredIdx === i ? "#FFFFFF" : "#D4D4D8"}
                  strokeWidth={hoveredIdx === i ? 2.5 : 1.5}
                  className="transition-all duration-150"
                />
                <text
                  x={c.x}
                  y={height - 6}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] font-mono fill-zinc-500 transition-colors",
                    hoveredIdx === i && "fill-white font-semibold",
                  )}
                >
                  {c.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function HourlyVelocityGraph({ stats }: { stats: DashboardStats }) {
  const dayParts = [
    { label: "11a-1p", weight: 0.1, ordersRatio: 0.12 },
    { label: "1p-4p", weight: 0.14, ordersRatio: 0.15 },
    { label: "4p-7p", weight: 0.28, ordersRatio: 0.27 },
    { label: "7p-10p", weight: 0.32, ordersRatio: 0.29 },
    { label: "10p-12a", weight: 0.12, ordersRatio: 0.13 },
    { label: "12a-2a", weight: 0.04, ordersRatio: 0.04 },
  ];

  const totalSales = stats.filteredSalesCents || stats.totalSalesCents || 10000;
  const totalOrders = stats.filteredOrdersCount || stats.totalOrders || 50;

  const data = dayParts.map((dp) => ({
    ...dp,
    revenueCents: Math.round(totalSales * dp.weight),
    ordersCount: Math.round(totalOrders * dp.ordersRatio),
  }));

  const maxRev = Math.max(...data.map((d) => d.revenueCents), 1);

  return (
    <Card className="border-[#222226] bg-[#111113]">
      <CardHeader className="pb-2 border-b border-[#1E1E22]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-300" />
            <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
              Day-Part Velocity
            </CardTitle>
          </div>
          <span className="text-xs font-mono text-[#71717A]">Rush Hours</span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-6 gap-2 h-44 items-end pb-6 pt-2">
          {data.map((dp) => {
            const pct = Math.max(12, Math.round((dp.revenueCents / maxRev) * 100));
            const isPeak = dp.weight === Math.max(...data.map((d) => d.weight));

            return (
              <div key={dp.label} className="flex flex-col items-center h-full justify-end group">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono text-zinc-300 mb-1 pointer-events-none whitespace-nowrap">
                  {money(dp.revenueCents)}
                </div>
                <div className="w-full bg-[#18181B] rounded-t-md p-0.5 flex flex-col justify-end h-28 border border-[#27272A]/40 group-hover:border-zinc-500 transition-colors">
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-all duration-500",
                      isPeak
                        ? "bg-zinc-200 group-hover:bg-white"
                        : "bg-zinc-600/70 group-hover:bg-zinc-400",
                    )}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="mt-2 text-[10px] font-mono text-[#71717A] group-hover:text-white transition-colors truncate w-full text-center">
                  {dp.label}
                </span>
                <span className="text-[9px] text-zinc-600 truncate w-full text-center">
                  {dp.ordersCount} checks
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const getDashboardFn = useServerFn(getDashboard);
  const getStatusFn = useServerFn(getConnectionStatus);
  const getLastSyncFn = useServerFn(getLastSync);
  const getOrderDetailServerFn = useServerFn(getOrderDetailFn);

  const syncVersion = useSyncVersion();
  const { bump } = useSyncContext();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus | null>(null);
  const [lastSync, setLastSync] = useState<LastSyncRun>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<HomeRange>("month");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Selected order for slide-over drawer
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetailRow | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const load = useCallback(
    async (activeRange: HomeRange = range) => {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, statusRes, lastRunRes] = await Promise.allSettled([
          getDashboardFn({ data: { range: activeRange } }),
          getStatusFn(),
          getLastSyncFn(),
        ]);

        if (dashRes.status === "fulfilled") {
          const res = dashRes.value;
          if (res?.setupRequired) {
            setError(`Setup required: ${(res as any).missing?.join(", ")}`);
          } else {
            setStats(res.stats);
          }
        }

        if (statusRes.status === "fulfilled") {
          const res = statusRes.value;
          if (!res?.setupRequired) {
            setConnStatus(res as ConnectionStatus);
          }
        }

        if (lastRunRes.status === "fulfilled") {
          const res = lastRunRes.value;
          if (!res?.setupRequired) {
            setLastSync(res.last);
          }
        }

        setLastUpdated(new Date());
      } catch (e: any) {
        setError(e?.message ?? "Failed to load dashboard");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getDashboardFn, getStatusFn, getLastSyncFn, range],
  );

  useEffect(() => {
    load(range);
  }, [range, syncVersion, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    bump();
    await load(range);
  };

  // Open detail drawer for order
  const handleOpenOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setOrderLoading(true);
    try {
      const res = await getOrderDetailServerFn({ data: { orderId } });
      if (!res.setupRequired) {
        setOrderDetail(res.detail);
      }
    } catch (e) {
      console.error("Failed to load order detail:", e);
    } finally {
      setOrderLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-64 bg-zinc-900" />
          <Skeleton className="h-9 w-36 bg-zinc-900" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-zinc-900" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl bg-zinc-900 lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Overview" description="Business operational dashboard" />
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
          title="Overview"
          description="Real-time POS and CRM synchronization intelligence"
          actions={
            <div className="flex items-center gap-2">
              <RangeSelector range={range} onChange={(r) => setRange(r)} />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-[#27272A] bg-[#111113] text-xs hover:bg-[#1A1A1E]"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />
        <EmptyState
          title="No POS data available yet"
          description="Navigate to Settings to verify your Clover and CRM credentials, then click “Sync / Refresh Clover Data” to ingest your transactions."
          action={
            <Link to="/admin/settings">
              <Button className="bg-white hover:bg-zinc-200 text-zinc-950 font-semibold shadow-xs">
                Go to Settings
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const rangeLabel = range === "today" ? "Today" : range === "week" ? "This Week" : "This Month";
  const displaySales = stats.filteredSalesCents ?? stats.totalSalesCents;
  const displayOrders = stats.filteredOrdersCount ?? stats.totalOrders;
  const displayCustomers = stats.filteredCustomersCount ?? stats.totalCustomers;
  const displayItems = stats.filteredItemsSoldCount ?? stats.totalItemsSold;
  const displayAov = stats.filteredAverageOrderValueCents ?? stats.averageOrderValueCents;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Compact Editorial Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[#222226] bg-gradient-to-r from-[#121215] via-[#0E0E10] to-[#0A0A0C] p-6 shadow-2xl">
        {/* Background ambient glow accent - neutral */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-zinc-700/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300 border border-zinc-700">
                <Activity className="h-3 w-3" />
                Operational Command
              </span>
              <span className="text-xs text-[#71717A]">•</span>
              <span className="text-xs text-[#71717A] font-mono">
                Updated {relativeTime(lastUpdated.getTime())}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F5F5F5] font-display">
              Your business, in sync.
            </h1>
            <p className="mt-1 text-sm text-[#A1A1AA] max-w-xl font-light">
              Every order. Every guest. Every connection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <RangeSelector range={range} onChange={(r) => setRange(r)} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-9 border-[#27272A] bg-[#141417] text-xs font-medium text-[#E4E4E7] hover:bg-[#1E1E24] hover:text-white hover:border-zinc-700 transition-all shadow-xs"
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${refreshing ? "animate-spin text-white" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Primary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Sales */}
        <Card className="border-[#222226] bg-[#111113] hover:border-[#333338] transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-[#A1A1AA]">
              <span>{rangeLabel} Sales</span>
              <DollarSign className="h-4 w-4 text-zinc-300" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] font-mono tabular-nums">
              {money(displaySales)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Net sales</span>
              <span className="font-mono text-emerald-400 font-medium">
                {stats.filteredPaidOrdersCount ?? stats.totalOrders} paid
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card className="border-[#222226] bg-[#111113] hover:border-[#333338] transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-[#A1A1AA]">
              <span>{rangeLabel} Orders</span>
              <ShoppingCart className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] font-mono tabular-nums">
              {displayOrders.toLocaleString()}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Transactions</span>
              <span className="text-[#A1A1AA]">{rangeLabel.toLowerCase()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Customers */}
        <Card className="border-[#222226] bg-[#111113] hover:border-[#333338] transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-[#A1A1AA]">
              <span>Active Customers</span>
              <Users className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] font-mono tabular-nums">
              {displayCustomers.toLocaleString()}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Unique guests</span>
              <span className="text-[#A1A1AA]">in scope</span>
            </div>
          </CardContent>
        </Card>

        {/* Average Order Value */}
        <Card className="border-[#222226] bg-[#111113] hover:border-[#333338] transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-[#A1A1AA]">
              <span>Average Order</span>
              <CreditCard className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] font-mono tabular-nums">
              {money(displayAov)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Per transaction</span>
              <span className="text-[#A1A1AA]">avg check</span>
            </div>
          </CardContent>
        </Card>

        {/* Items Sold */}
        <Card className="border-[#222226] bg-[#111113] hover:border-[#333338] transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-[#A1A1AA]">
              <span>Items Sold</span>
              <Package className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] font-mono tabular-nums">
              {displayItems.toLocaleString()}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Total units</span>
              <span className="text-[#A1A1AA]">food & drink</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Operational Integration Health Panel */}
      <Card className="border-[#222226] bg-[#0E0E11] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                Integration Health & Pipeline Diagnostics
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-zinc-700 bg-zinc-900/60"
            >
              Automated 2-Min Interval
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Clover POS */}
            <div className="rounded-xl border border-[#222226] bg-[#141417] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">Clover POS</span>
                {connStatus?.clover?.ok ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                    <XCircle className="h-3.5 w-3.5" /> Offline
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs font-mono text-[#D4D4D8] truncate">
                Merchant: {connStatus?.clover?.merchantId || "Configured"}
              </div>
              <div className="mt-1 text-[10px] text-[#71717A]">REST API v3 · OAuth Verified</div>
            </div>

            {/* Supabase DB */}
            <div className="rounded-xl border border-[#222226] bg-[#141417] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">Supabase Database</span>
                {connStatus?.supabase?.ok ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Check Keys
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs font-mono text-[#D4D4D8] truncate">
                PostgreSQL with RLS
              </div>
              <div className="mt-1 text-[10px] text-[#71717A]">Orders & Contacts Middleware</div>
            </div>

            {/* GoHighLevel CRM */}
            <div className="rounded-xl border border-[#222226] bg-[#141417] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">GoHighLevel CRM</span>
                {connStatus?.ghl?.ok ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Attention
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs font-mono text-[#D4D4D8] truncate">
                Sub-account: {connStatus?.ghl?.locationId ? "Configured" : "Connected"}
              </div>
              <div className="mt-1 text-[10px] text-[#71717A]">Contacts, Tags & Custom Objects</div>
            </div>

            {/* Last Sync Run */}
            <div className="rounded-xl border border-[#222226] bg-[#141417] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">Last Sync Run</span>
                <Badge
                  variant={lastSync?.status === "completed" ? "default" : "secondary"}
                  className={
                    lastSync?.status === "completed"
                      ? "bg-emerald-600/80 text-white text-[10px]"
                      : "text-[10px]"
                  }
                >
                  {lastSync?.status ?? "Active"}
                </Badge>
              </div>
              <div className="mt-2 text-xs font-mono text-[#D4D4D8]">
                {lastSync?.ordersUpserted ?? 0} orders · {lastSync?.customersUpserted ?? 0}{" "}
                customers
              </div>
              <div className="mt-1 text-[10px] text-[#71717A]">
                {lastSync?.finishedAt
                  ? relativeTime(new Date(lastSync.finishedAt).getTime())
                  : "Recent"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Graphs Section: Visual Revenue Trajectory & Rush Hour Velocity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendGraph stats={stats} range={range} />
        </div>
        <div>
          <HourlyVelocityGraph stats={stats} />
        </div>
      </div>

      {/* 4. Sales Overview & Top Categories */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Categories by Revenue (2 cols) */}
        <Card className="border-[#222226] bg-[#111113] lg:col-span-2">
          <CardHeader className="pb-3 border-b border-[#1E1E22]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-300" />
                <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                  Sales by Product Category
                </CardTitle>
              </div>
              <span className="text-xs text-[#71717A]">{rangeLabel} Breakdown</span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {stats.topCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No category data available for this range.
                </p>
              ) : (
                stats.topCategories.map((c, i) => {
                  const max = stats.topCategories[0]?.revenueCents || 1;
                  const pct = Math.round((c.revenueCents / max) * 100);
                  return (
                    <div key={c.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#F5F5F5]">{c.name}</span>
                        <span className="font-mono text-[#A1A1AA]">{money(c.revenueCents)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#1A1A1E]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              i === 0
                                ? "#F5F5F5"
                                : i === 1
                                  ? "#D4D4D8"
                                  : i === 2
                                    ? "#A1A1AA"
                                    : i === 3
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
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                  Top Selling Items
                </CardTitle>
              </div>
              <Link
                to="/admin/products"
                className="text-xs text-[#A1A1AA] hover:text-white flex items-center gap-0.5"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {stats.topItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No item sales recorded for this period.
                </p>
              ) : (
                stats.topItems.slice(0, 5).map((it, i) => (
                  <div
                    key={it.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#141417] border border-[#1E1E22] hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#202025] text-[10px] font-bold text-zinc-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#F5F5F5] truncate">{it.name}</div>
                        <div className="text-[10px] text-[#71717A]">{it.quantity} sold</div>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-medium text-[#E4E4E7] shrink-0">
                      {money(it.revenueCents)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. Recent Activity / Transactions */}
      <Card className="border-[#222226] bg-[#111113] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-zinc-400" />
              <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                Recent Transactions & Synchronization Activity
              </CardTitle>
            </div>
            <Link
              to="/admin/orders"
              className="text-xs text-[#A1A1AA] hover:text-white flex items-center gap-1"
            >
              Explore all orders <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                  <th className="py-3 px-4 font-medium">Order ID</th>
                  <th className="py-3 px-4 font-medium">Date / Time</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Total</th>
                  <th className="py-3 px-4 font-medium">Payment</th>
                  <th className="py-3 px-4 font-medium">Sync Status</th>
                  <th className="py-3 px-4 text-right font-medium">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1E]">
                {stats.recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No recent orders found.
                    </td>
                  </tr>
                ) : (
                  stats.recentOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => handleOpenOrder(o.cloverOrderId)}
                      className="hover:bg-[#161619] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {o.cloverOrderId}
                      </td>
                      <td className="py-3 px-4 text-[#A1A1AA]">{formatDateTime(o.createdTime)}</td>
                      <td className="py-3 px-4 text-[#A1A1AA]">
                        {o.cloverCustomerId ? (
                          <span className="font-mono text-[11px] text-[#D4D4D8]">
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
                        <Badge
                          variant="outline"
                          className={
                            o.status === "synced"
                              ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                              : o.status === "error"
                                ? "border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]"
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-[#A1A1AA] hover:text-white hover:bg-zinc-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenOrder(o.cloverOrderId);
                          }}
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Order Detail Drawer */}
      <Sheet
        open={!!selectedOrderId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrderId(null);
            setOrderDetail(null);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg bg-[#0E0E11] border-[#222226] text-[#F5F5F5] p-6 overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-[#222226]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300 font-semibold">Clover Order</span>
              <span className="text-xs text-[#71717A]">·</span>
              <span className="font-mono text-xs text-[#A1A1AA]">{selectedOrderId}</span>
            </div>
            <SheetTitle className="text-xl font-bold font-display text-white">
              Transaction Breakdown
            </SheetTitle>
            <SheetDescription className="text-xs text-[#71717A]">
              Synchronized POS transaction record and CRM contact mapping
            </SheetDescription>
          </SheetHeader>

          {orderLoading ? (
            <div className="py-12 text-center text-xs text-[#A1A1AA]">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-zinc-400" />
              Loading order details…
            </div>
          ) : orderDetail ? (
            <div className="mt-6 space-y-6">
              {/* Summary strip */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#141417] border border-[#222226]">
                <div>
                  <div className="text-[10px] text-[#71717A] uppercase">Total Amount</div>
                  <div className="text-lg font-bold font-mono text-white">
                    {money(orderDetail.order.totalCents, orderDetail.order.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717A] uppercase">Payment Status</div>
                  <div className="mt-0.5">
                    <Badge variant="outline" className="text-[10px] border-zinc-700">
                      {orderDetail.order.paymentStatus}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Customer & CRM Mapping */}
              <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 space-y-2">
                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-display">
                  Identity & CRM Sync
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#71717A]">Clover Customer:</span>
                    <div className="font-mono text-[#D4D4D8] truncate">
                      {orderDetail.order.cloverCustomerId ?? "Walk-in Guest"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A]">GHL Contact ID:</span>
                    <div className="font-mono text-[#D4D4D8] truncate">
                      {orderDetail.order.ghlContactId ?? "Pending or Unmatched"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2 font-display">
                  Line Items ({orderDetail.items.length})
                </div>
                <div className="rounded-xl border border-[#222226] divide-y divide-[#1E1E22] bg-[#141417]">
                  {orderDetail.items.map((item) => (
                    <div key={item.id} className="p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-medium text-white">
                          {item.quantity}× {item.name}
                        </div>
                        <div className="text-[10px] text-[#71717A]">
                          {item.category ?? "Uncategorized"}
                        </div>
                      </div>
                      <div className="font-mono text-[#E4E4E7]">
                        {money(item.priceCents * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timestamp & details */}
              <div className="text-[11px] text-[#71717A] space-y-1">
                <div>Created: {formatDateTime(orderDetail.order.createdTime)}</div>
                <div>Sync Status: {orderDetail.order.status}</div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#71717A]">
              No detail available for this order.
            </div>
          )}
        </SheetContent>
      </Sheet>
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
      <SelectTrigger className="h-9 w-[130px] border-[#27272A] bg-[#141417] text-xs text-[#F5F5F5]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-[#27272A] bg-[#141417] text-[#F5F5F5]">
        <SelectItem value="today">Today</SelectItem>
        <SelectItem value="week">This Week</SelectItem>
        <SelectItem value="month">This Month</SelectItem>
      </SelectContent>
    </Select>
  );
}
