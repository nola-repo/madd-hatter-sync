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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ExternalLink,
    Loader2,
    Search,
    Tag,
    Users,
    AlertTriangle,
    CheckCircle2,
    Phone,
    Mail,
    RefreshCw,
    ShieldCheck,
    Layers,
    Sparkles,
    Check,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton, MetricCardsSkeleton } from "@/components/ui/table-skeleton";
import {
    findItemCustomers,
    tagItemCustomers,
    getMappingMonitorFn,
    getMappingTableFn,
    getReviewQueueFn,
    getSyncedContactsFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type {
    ItemSearchResult,
    PurchaseTagSummary,
} from "@/lib/integration/purchase-mapping.server";

type Range = "today" | "week" | "month" | "all";

const CRM_LOCATION_ID = "7biYjalPZzmmvKaLw0WN";
function crmContactUrl(contactId: string) {
    return `https://app.gohighlevel.com/sub-account/${CRM_LOCATION_ID}/contacts/${contactId}`;
}

export function PurchaseMappingPage() {
    const findFn = useServerFn(findItemCustomers);
    const tagFn = useServerFn(tagItemCustomers);
    const monitorFn = useServerFn(getMappingMonitorFn);
    const tableFn = useServerFn(getMappingTableFn);
    const reviewFn = useServerFn(getReviewQueueFn);
    const syncedFn = useServerFn(getSyncedContactsFn);
    const syncVersion = useSyncVersion();
    const { bump } = useSyncContext();

    const [search, setSearch] = useState("");
    const [range, setRange] = useState<Range>("all");
    const [result, setResult] = useState<ItemSearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [tagging, setTagging] = useState(false);
    const [tagSummary, setTagSummary] = useState<PurchaseTagSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Monitor state
    const [stats, setStats] = useState<any>(null);
    const [tableRows, setTableRows] = useState<any[]>([]);
    const [reviewRows, setReviewRows] = useState<any[]>([]);
    const [syncedRows, setSyncedRows] = useState<any[]>([]);
    const [syncedTotal, setSyncedTotal] = useState(0);
    const [monitorLoading, setMonitorLoading] = useState(true);

    const loadMonitor = useCallback(async () => {
        setMonitorLoading(true);
        try {
            const [s, t, r, sc] = await Promise.all([
                monitorFn(),
                tableFn({ data: { limit: 100 } }),
                reviewFn({ data: { limit: 50 } }),
                syncedFn({ data: { limit: 100 } }),
            ]);
            setStats((s as any)?.stats ?? null);
            setTableRows((t as any)?.rows ?? []);
            setReviewRows((r as any)?.rows ?? []);
            setSyncedRows((sc as any)?.contacts ?? []);
            setSyncedTotal((sc as any)?.total ?? 0);
        } catch (e) {
            console.error("Monitor load error:", e);
        } finally {
            setMonitorLoading(false);
        }
    }, [monitorFn, tableFn, reviewFn, syncedFn]);

    useEffect(() => {
        loadMonitor();
    }, [loadMonitor, syncVersion]);

    const search_ = useCallback(async () => {
        if (!search.trim()) return;
        setLoading(true);
        setError(null);
        setTagSummary(null);
        try {
            const res = await findFn({ data: { itemName: search.trim(), range } });
            if (res?.setupRequired) {
                setError("Setup required: " + res.message);
                return;
            }
            setResult(res as any);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    }, [findFn, search, range]);

    const applyTags = useCallback(async () => {
        if (!search.trim()) return;
        setTagging(true);
        setError(null);
        try {
            const res = await tagFn({ data: { itemName: search.trim(), range } });
            if (res?.setupRequired) {
                setError("Setup required: " + res.message);
                return;
            }
            setTagSummary(res as any);
            await search_();
            await loadMonitor();
            bump();
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setTagging(false);
        }
    }, [tagFn, search, range, search_, loadMonitor, bump]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Purchase Mapping"
                description="Identity reconciliation monitor and CRM purchase tag automation workspace."
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            bump();
                            loadMonitor();
                        }}
                        disabled={monitorLoading}
                        className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
                    >
                        <RefreshCw
                            className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${monitorLoading ? "animate-spin" : ""}`}
                        />
                        Refresh Monitor
                    </Button>
                }
            />

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="bg-[#141417] border border-[#222226] p-1 h-10 rounded-xl">
                    <TabsTrigger
                        value="overview"
                        className="text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white"
                    >
                        Mapping Monitor
                    </TabsTrigger>
                    <TabsTrigger
                        value="synced"
                        className="text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white"
                    >
                        Synced CRM Contacts ({syncedTotal})
                    </TabsTrigger>
                    <TabsTrigger
                        value="review"
                        className="text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white"
                    >
                        Review Queue ({reviewRows.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="search"
                        className="text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white"
                    >
                        Item Tagging Engine
                    </TabsTrigger>
                </TabsList>

                {/* ---- 1. MONITOR OVERVIEW ---- */}
                <TabsContent value="overview" className="space-y-6">
                    {monitorLoading ? (
                        <div className="space-y-6">
                            <MetricCardsSkeleton count={4} />
                            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                                    <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
                                </CardHeader>
                                <CardContent className="p-0">
                                    <TableSkeleton rowCount={8} columnCount={8} />
                                </CardContent>
                            </Card>
                        </div>
                    ) : stats ? (
                        <>
                            {/* Summary Metrics Grid */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Card className="border-[#222226] bg-[#111113]">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                                            <span>Matched CRM Contacts</span>
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                        </div>
                                        <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
                                            {stats.matchedGhlContacts?.toLocaleString() ?? 0}
                                        </div>
                                        <div className="mt-1 text-[11px] text-[#71717A]">
                                            {stats.verifiedMappings ?? 0} verified mappings
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-[#222226] bg-[#111113]">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                                            <span>Tags Applied & Verified</span>
                                            <Tag className="h-4 w-4 text-blue-400" />
                                        </div>
                                        <div className="mt-2 text-2xl font-bold font-mono text-blue-400">
                                            {stats.tagsVerified?.toLocaleString() ?? 0}
                                        </div>
                                        <div className="mt-1 text-[11px] text-[#71717A]">
                                            {stats.tagsApplied ?? 0} dispatched to GHL
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-[#222226] bg-[#111113]">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                                            <span>Review Queue</span>
                                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                                        </div>
                                        <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
                                            {stats.needsReview?.toLocaleString() ?? 0}
                                        </div>
                                        <div className="mt-1 text-[11px] text-[#71717A]">
                                            {stats.conflicts ?? 0} identifier conflicts
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-[#222226] bg-[#111113]">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                                            <span>Unmatched Guests</span>
                                            <Users className="h-4 w-4 text-zinc-400" />
                                        </div>
                                        <div className="mt-2 text-2xl font-bold font-mono text-white">
                                            {stats.unmatchedCustomers?.toLocaleString() ?? 0}
                                        </div>
                                        <div className="mt-1 text-[11px] text-[#71717A]">
                                            Awaiting phone / email capture
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Customer Mapping Table */}
                            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-sm font-semibold text-white font-display">
                                                Identity Mapping Registry ({tableRows.length})
                                            </CardTitle>
                                        </div>
                                        <span className="text-xs text-[#71717A]">
                                            Phone, Email & Cached Verification
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {tableRows.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-[#71717A]">
                                            No mappings generated yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                                        <th className="py-3 px-4 font-medium">Customer Profile</th>
                                                        <th className="py-3 px-4 font-medium">Phone / Email</th>
                                                        <th className="py-3 px-4 font-medium">Purchases</th>
                                                        <th className="py-3 px-4 font-medium">Matched GHL Contact</th>
                                                        <th className="py-3 px-4 font-medium">Match Method</th>
                                                        <th className="py-3 px-4 font-medium">Match Status</th>
                                                        <th className="py-3 px-4 font-medium">Tags</th>
                                                        <th className="py-3 px-4 font-medium">Sync State</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#1A1A1E]">
                                                    {tableRows.map((c, i) => (
                                                        <tr key={i} className="hover:bg-[#161619] transition-colors">
                                                            <td className="py-3 px-4 font-medium text-white">
                                                                {c.customerName}
                                                            </td>
                                                            <td className="py-3 px-4 text-[#A1A1AA] font-mono text-[11px]">
                                                                {c.email || c.phone || "—"}
                                                            </td>
                                                            <td className="py-3 px-4 font-mono font-medium text-white">
                                                                {c.purchaseCount}
                                                            </td>
                                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                                {c.ghlContactId ? (
                                                                    <a
                                                                        href={crmContactUrl(c.ghlContactId)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-400 hover:underline inline-flex items-center gap-1"
                                                                    >
                                                                        {c.ghlContactId.slice(0, 8)}…
                                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-[#52525B]">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <MatchMethodBadge method={c.matchMethod} />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={
                                                                        c.matchStatus === "MATCHED" || c.matchStatus === "MAPPED"
                                                                            ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                                            : "border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]"
                                                                    }
                                                                >
                                                                    {c.matchStatus}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-3 px-4 font-mono text-zinc-300">
                                                                {c.tagCount}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={
                                                                        c.syncStatus === "SYNCED"
                                                                            ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                                            : "border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]"
                                                                    }
                                                                >
                                                                    {c.syncStatus}
                                                                </Badge>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : null}
                </TabsContent>

                {/* ---- 2. SYNCED CRM CONTACTS ---- */}
                <TabsContent value="synced">
                    <Card className="border-[#222226] bg-[#111113] shadow-lg">
                        <CardHeader className="pb-3 border-b border-[#1E1E22]">
                            <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                Verified & Synced Contacts ({syncedTotal})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {monitorLoading ? (
                                <TableSkeleton rowCount={8} columnCount={7} />
                            ) : syncedRows.length === 0 ? (
                                <div className="p-8 text-center text-xs text-[#71717A]">
                                    No contacts synced to CRM yet.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                                <th className="py-3 px-4 font-medium">Customer Name</th>
                                                <th className="py-3 px-4 font-medium">Identifier</th>
                                                <th className="py-3 px-4 font-medium">GHL Contact ID</th>
                                                <th className="py-3 px-4 font-medium">Match Method</th>
                                                <th className="py-3 px-4 font-medium">Tags Applied</th>
                                                <th className="py-3 px-4 font-medium">Verified Tags</th>
                                                <th className="py-3 px-4 font-medium">Verification Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1A1A1E]">
                                            {syncedRows.map((c, i) => (
                                                <tr key={i} className="hover:bg-[#161619] transition-colors">
                                                    <td className="py-3 px-4 font-medium text-white">
                                                        {c.customerName}
                                                    </td>
                                                    <td className="py-3 px-4 text-[#A1A1AA] font-mono text-[11px]">
                                                        {c.email || c.phone || "—"}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-[11px]">
                                                        <a
                                                            href={crmContactUrl(c.ghlContactId)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-400 hover:underline inline-flex items-center gap-1"
                                                        >
                                                            {c.ghlContactId}
                                                            <ExternalLink className="h-2.5 w-2.5" />
                                                        </a>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <MatchMethodBadge method={c.matchMethod} />
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-zinc-300">
                                                        {c.tagsApplied}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {c.tagsVerified > 0 ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                            >
                                                                {c.tagsVerified} verified
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-[#52525B]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-[#71717A]">
                                                        {c.verifiedAt
                                                            ? formatDateTime(new Date(c.verifiedAt).getTime())
                                                            : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---- 3. REVIEW QUEUE ---- */}
                <TabsContent value="review">
                    <Card className="border-[#222226] bg-[#111113] shadow-lg">
                        <CardHeader className="pb-3 border-b border-[#1E1E22]">
                            <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                                Ambiguous Matches & Conflict Review ({reviewRows.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {monitorLoading ? (
                                <TableSkeleton rowCount={6} columnCount={4} />
                            ) : reviewRows.length === 0 ? (
                                <div className="p-8 text-center text-xs text-emerald-400">
                                    <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
                                    Zero conflicts or ambiguous records pending review.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                                <th className="py-3 px-4 font-medium">Customer Name</th>
                                                <th className="py-3 px-4 font-medium">Email / Phone</th>
                                                <th className="py-3 px-4 font-medium">Status Flag</th>
                                                <th className="py-3 px-4 font-medium">Audit Rationale</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1A1A1E]">
                                            {reviewRows.map((r, i) => (
                                                <tr key={i} className="hover:bg-[#161619] transition-colors">
                                                    <td className="py-3 px-4 font-medium text-white">
                                                        {r.customerName}
                                                    </td>
                                                    <td className="py-3 px-4 text-[#A1A1AA] font-mono text-[11px]">
                                                        {r.email || r.phone || "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <Badge
                                                            variant="outline"
                                                            className="border-amber-800/40 bg-amber-950/40 text-amber-400 text-[10px]"
                                                        >
                                                            {r.matchStatus}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4 text-[#A1A1AA]">
                                                        {r.reason}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---- 4. ITEM TAGGING ENGINE ---- */}
                <TabsContent value="search" className="space-y-6">
                    <Card className="border-[#222226] bg-[#111113]">
                        <CardHeader className="pb-3 border-b border-[#1E1E22]">
                            <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-zinc-400" />
                                Item Customer Lookup & CRM Tag Dispatch
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                    <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                                        Menu Item Query (e.g. "Wings", "Beer", "Burger")
                                    </label>
                                    <Input
                                        placeholder="Enter item name…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && search_()}
                                        className="h-9 border-[#27272A] bg-[#141417] text-xs text-white"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                                        Filter Range
                                    </label>
                                    <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                                        <SelectTrigger className="h-9 w-[130px] border-[#27272A] bg-[#141417] text-xs text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-[#27272A] bg-[#141417] text-white">
                                            <SelectItem value="all">All time</SelectItem>
                                            <SelectItem value="today">Today</SelectItem>
                                            <SelectItem value="week">This Week</SelectItem>
                                            <SelectItem value="month">This Month</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button
                                    onClick={search_}
                                    disabled={loading || !search.trim()}
                                    className="h-9 bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-xs gap-1.5 shadow-xs"
                                >
                                    {loading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Search className="h-3.5 w-3.5" />
                                    )}
                                    Search Guests
                                </Button>
                            </div>
                            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                        </CardContent>
                    </Card>

                    {result && result.itemFound && (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-4">
                                <Card className="border-[#222226] bg-[#141417] p-3 text-xs">
                                    <span className="text-[#71717A]">Purchasers</span>
                                    <div className="text-xl font-bold font-mono text-white mt-1">
                                        {result.totalCustomers}
                                    </div>
                                </Card>
                                <Card className="border-[#222226] bg-[#141417] p-3 text-xs">
                                    <span className="text-[#71717A]">Total Units</span>
                                    <div className="text-xl font-bold font-mono text-white mt-1">
                                        {result.totalQuantity}
                                    </div>
                                </Card>
                                <Card className="border-[#222226] bg-[#141417] p-3 text-xs">
                                    <span className="text-[#71717A]">Revenue</span>
                                    <div className="text-xl font-bold font-mono text-white mt-1">
                                        {money(result.totalRevenueCents)}
                                    </div>
                                </Card>
                                <Card className="border-[#222226] bg-[#141417] p-3 text-xs">
                                    <span className="text-[#71717A]">Item Queried</span>
                                    <div className="text-sm font-semibold text-zinc-200 mt-1 truncate">
                                        {result.itemName}
                                    </div>
                                </Card>
                            </div>

                            {/* Tag summary notification */}
                            {tagSummary && (
                                <Card className="border-emerald-800/40 bg-emerald-950/20 p-4 text-xs text-emerald-200">
                                    <div className="font-semibold flex items-center gap-1.5 mb-2">
                                        <Check className="h-4 w-4 text-emerald-400" />
                                        Tags Dispatched to GoHighLevel CRM
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                        <div>Processed: <strong className="font-mono">{tagSummary.processed}</strong></div>
                                        <div>Applied: <strong className="font-mono">{tagSummary.tagsApplied}</strong></div>
                                        <div>Verified: <strong className="font-mono">{tagSummary.tagsVerified}</strong></div>
                                        <div>Already Present: <strong className="font-mono">{tagSummary.alreadyTagged}</strong></div>
                                    </div>
                                </Card>
                            )}

                            {/* Customer purchase results */}
                            <Card className="border-[#222226] bg-[#111113]">
                                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <CardTitle className="text-sm font-semibold text-white font-display">
                                            Purchasers ({result.customers.length})
                                        </CardTitle>
                                        <Button
                                            onClick={applyTags}
                                            disabled={tagging || result.customers.length === 0}
                                            className="h-8 bg-white hover:bg-zinc-200 text-xs font-semibold text-zinc-950 gap-1.5 shadow-xs"
                                        >
                                            {tagging ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Tag className="h-3.5 w-3.5" />
                                            )}
                                            Apply "Clover - Purchased: {result.itemName}"
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                                                    <th className="py-3 px-4 font-medium">Customer Name</th>
                                                    <th className="py-3 px-4 font-medium">Contact</th>
                                                    <th className="py-3 px-4 font-medium">Qty</th>
                                                    <th className="py-3 px-4 font-medium">Spent</th>
                                                    <th className="py-3 px-4 font-medium">Date</th>
                                                    <th className="py-3 px-4 font-medium">Clover Order</th>
                                                    <th className="py-3 px-4 font-medium">CRM Contact</th>
                                                    <th className="py-3 px-4 font-medium">Tag Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#1A1A1E]">
                                                {result.customers.map((c, i) => (
                                                    <tr key={i} className="hover:bg-[#161619] transition-colors">
                                                        <td className="py-3 px-4 font-medium text-white">
                                                            {c.customerName}
                                                        </td>
                                                        <td className="py-3 px-4 text-[#A1A1AA] font-mono text-[11px]">
                                                            {c.email || c.phone || "—"}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono font-medium text-white">
                                                            {c.quantity}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-white">
                                                            {money(c.amountSpentCents)}
                                                        </td>
                                                        <td className="py-3 px-4 text-[#71717A]">
                                                            {formatDateTime(c.purchaseDate)}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-[11px] text-[#A1A1AA]">
                                                            {c.cloverOrderId}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-[11px]">
                                                            {c.ghlContactId ? (
                                                                <a
                                                                    href={crmContactUrl(c.ghlContactId)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-400 hover:underline flex items-center gap-1"
                                                                >
                                                                    View in GHL
                                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                                </a>
                                                            ) : (
                                                                <span className="text-[#52525B]">Unmatched</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    c.tagStatus === "TAG_APPLIED" || c.tagStatus === "ALREADY_TAGGED"
                                                                        ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                                                        : "border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]"
                                                                }
                                                            >
                                                                {c.tagStatus}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {result && !result.itemFound && (
                        <EmptyState
                            title="No matching item found"
                            description={`No sales recorded for "${search}". Please verify the item name in your Clover inventory.`}
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function MatchMethodBadge({ method }: { method: string | null }) {
    if (!method) return <span className="text-[#52525B] text-xs">—</span>;
    const lower = method.toLowerCase();
    if (lower.includes("phone")) {
        return (
            <Badge
                variant="outline"
                className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px] gap-1"
            >
                <Phone className="h-2.5 w-2.5" /> Phone
            </Badge>
        );
    }
    if (lower.includes("email")) {
        return (
            <Badge
                variant="outline"
                className="border-blue-800/40 bg-blue-950/40 text-blue-400 text-[10px] gap-1"
            >
                <Mail className="h-2.5 w-2.5" /> Email
            </Badge>
        );
    }
    return (
        <Badge
            variant="outline"
            className="border-purple-800/40 bg-purple-950/40 text-purple-300 text-[10px]"
        >
            {method}
        </Badge>
    );
}
