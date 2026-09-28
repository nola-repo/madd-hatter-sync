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
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
    findItemCustomers,
    tagItemCustomers,
    getMappingMonitorFn,
    getMappingTableFn,
    getReviewQueueFn,
    getSyncedContactsFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import { money, formatDateTime } from "@/lib/integration/format";
import type {
    ItemSearchResult,
    PurchaseTagSummary,
} from "@/lib/integration/purchase-mapping.server";

type Range = "today" | "week" | "month" | "all";

// CRM contact detail URL. The locationId is the configured sub-account.
const CRM_LOCATION_ID = "7biYjalPZzmmvKaLw0WN";
function crmContactUrl(contactId: string) {
    return `https://app.gohighlevel.com/sub-account/${CRM_LOCATION_ID}/contacts/${contactId}`;
}

const STATUS_COLORS: Record<string, string> = {
    MAPPED: "default",
    MATCHED: "default",
    CONTACT_CREATED: "secondary",
    TAG_APPLIED: "default",
    ALREADY_TAGGED: "secondary",
    NO_CUSTOMER: "outline",
    NO_MATCH: "outline",
    NO_GHL_MATCH: "outline",
    NO_IDENTIFIERS: "outline",
    CONTACT_MATCH_CONFLICT: "destructive",
    CONFLICT: "destructive",
    MAPPING_FAILED: "destructive",
    SKIPPED_REFUNDED: "outline",
    UNMATCHED: "outline",
    NEEDS_REVIEW: "secondary",
    AMBIGUOUS_MATCH: "secondary",
};

const SYNC_COLORS: Record<string, string> = {
    SYNCED: "default",
    PROCESSED: "secondary",
    PENDING: "outline",
    NO_CUSTOMER: "outline",
    NO_GHL_MATCH: "outline",
    NEEDS_REVIEW: "secondary",
    CONFLICT: "destructive",
    PARTIAL: "secondary",
    VOIDED: "outline",
    NOT_PAID: "outline",
};

export function PurchaseMappingPage() {
    const findFn = useServerFn(findItemCustomers);
    const tagFn = useServerFn(tagItemCustomers);
    const monitorFn = useServerFn(getMappingMonitorFn);
    const tableFn = useServerFn(getMappingTableFn);
    const reviewFn = useServerFn(getReviewQueueFn);
    const syncedFn = useServerFn(getSyncedContactsFn);
    const syncVersion = useSyncVersion();

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
        } catch {
            /* ignore */
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
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setTagging(false);
        }
    }, [tagFn, search, range, search_, loadMonitor]);

    return (
        <div>
            <PageHeader
                title="Purchase Mapping"
                description="Monitor Clover → CRM contact matching and purchase tags. Search 'Who bought Wings?' to apply tags."
            />

            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="synced">Synced ({syncedTotal})</TabsTrigger>
                    <TabsTrigger value="review">Review Queue</TabsTrigger>
                    <TabsTrigger value="search">Item Search</TabsTrigger>
                </TabsList>

                {/* ---- OVERVIEW ---- */}
                <TabsContent value="overview">
                    {monitorLoading ? (
                        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading mapping monitor…
                        </div>
                    ) : stats ? (
                        <>
                            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <StatCard
                                    label="Clover Customers"
                                    value={stats.totalCloverCustomers}
                                    icon={<Users className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="With Purchases"
                                    value={stats.customersWithPurchases}
                                    icon={<Users className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Matched CRM"
                                    value={stats.matchedGhlContacts}
                                    icon={<CheckCircle2 className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Verified Mappings"
                                    value={stats.verifiedMappings}
                                    icon={<CheckCircle2 className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Unmatched"
                                    value={stats.unmatchedCustomers}
                                    icon={<AlertTriangle className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Needs Review"
                                    value={stats.needsReview}
                                    icon={<AlertTriangle className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Conflicts"
                                    value={stats.conflicts}
                                    icon={<AlertTriangle className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Tags Applied"
                                    value={stats.tagsApplied}
                                    icon={<Tag className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Tags Verified"
                                    value={stats.tagsVerified}
                                    icon={<CheckCircle2 className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Tags Failed"
                                    value={stats.tagsFailed}
                                    icon={<AlertTriangle className="h-4 w-4" />}
                                />
                                <StatCard
                                    label="Out of Sync"
                                    value={stats.outOfSync}
                                    icon={<AlertTriangle className="h-4 w-4" />}
                                />
                            </div>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">
                                        Customer Mapping Table ({tableRows.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {tableRows.length === 0 ? (
                                        <EmptyState
                                            title="No customers mapped yet"
                                            description="Run 'Sync Clover Data' in Settings to process purchases and match CRM contacts."
                                        />
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                                        <th className="pb-2 pr-4 font-medium">Customer</th>
                                                        <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                                                        <th className="pb-2 pr-4 font-medium">Purchases</th>
                                                        <th className="pb-2 pr-4 font-medium">CRM Contact</th>
                                                        <th className="pb-2 pr-4 font-medium">Match Method</th>
                                                        <th className="pb-2 pr-4 font-medium">Match Status</th>
                                                        <th className="pb-2 pr-4 font-medium">Tags</th>
                                                        <th className="pb-2 font-medium">Sync</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tableRows.map((c, i) => (
                                                        <tr key={i} className="border-b border-border/50">
                                                            <td className="py-2.5 pr-4 font-medium text-foreground">
                                                                {c.customerName}
                                                            </td>
                                                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                                {c.email || c.phone || "—"}
                                                            </td>
                                                            <td className="py-2.5 pr-4">{c.purchaseCount}</td>
                                                            <td className="py-2.5 pr-4">
                                                                {c.ghlContactId ? (
                                                                    <a
                                                                        href={crmContactUrl(c.ghlContactId)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                                    >
                                                                        {c.ghlContactId.slice(0, 8)}…
                                                                        <ExternalLink className="h-3 w-3" />
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                                {c.matchMethod ?? "—"}
                                                            </td>
                                                            <td className="py-2.5 pr-4">
                                                                <Badge
                                                                    variant={(STATUS_COLORS[c.matchStatus] as any) ?? "outline"}
                                                                    className="text-[10px]"
                                                                >
                                                                    {c.matchStatus}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-2.5 pr-4">{c.tagCount}</td>
                                                            <td className="py-2.5 pr-4">
                                                                <Badge
                                                                    variant={(SYNC_COLORS[c.syncStatus] as any) ?? "outline"}
                                                                    className="text-[10px]"
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
                    ) : (
                        <EmptyState
                            title="No monitor data"
                            description="Run 'Sync Clover Data' in Settings to populate mapping data."
                        />
                    )}
                </TabsContent>

                {/* ---- SYNCED CONTACTS ---- */}
                <TabsContent value="synced">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CheckCircle2 className="h-4 w-4" /> Synced Contacts ({syncedTotal})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {syncedRows.length === 0 ? (
                                <EmptyState
                                    title="No synced contacts yet"
                                    description="Confidently matched CRM contacts with applied purchase tags will appear here after you run 'Process Customer Mappings & Tags' in Settings."
                                />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                                <th className="pb-2 pr-4 font-medium">Customer</th>
                                                <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                                                <th className="pb-2 pr-4 font-medium">CRM Contact</th>
                                                <th className="pb-2 pr-4 font-medium">Match Method</th>
                                                <th className="pb-2 pr-4 font-medium">Tags Applied</th>
                                                <th className="pb-2 pr-4 font-medium">Tags Verified</th>
                                                <th className="pb-2 font-medium">Verified At</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {syncedRows.map((c, i) => (
                                                <tr key={i} className="border-b border-border/50">
                                                    <td className="py-2.5 pr-4 font-medium text-foreground">
                                                        {c.customerName}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                        {c.email || c.phone || "—"}
                                                    </td>
                                                    <td className="py-2.5 pr-4">
                                                        <a
                                                            href={crmContactUrl(c.ghlContactId)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                        >
                                                            {c.ghlContactId.slice(0, 8)}…
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                        {c.matchMethod}
                                                    </td>
                                                    <td className="py-2.5 pr-4">{c.tagsApplied}</td>
                                                    <td className="py-2.5 pr-4">
                                                        {c.tagsVerified > 0 ? (
                                                            <Badge variant="default" className="text-[10px]">
                                                                {c.tagsVerified} verified
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                        {c.verifiedAt ? formatDateTime(new Date(c.verifiedAt).getTime()) : "—"}
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

                {/* ---- REVIEW QUEUE ---- */}
                <TabsContent value="review">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <AlertTriangle className="h-4 w-4" /> Needs Review ({reviewRows.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {reviewRows.length === 0 ? (
                                <EmptyState
                                    title="No items need review"
                                    description="Name-only matches, ambiguous identifiers, and conflicts will appear here."
                                />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                                <th className="pb-2 pr-4 font-medium">Customer</th>
                                                <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                                                <th className="pb-2 pr-4 font-medium">Status</th>
                                                <th className="pb-2 font-medium">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reviewRows.map((r, i) => (
                                                <tr key={i} className="border-b border-border/50">
                                                    <td className="py-2.5 pr-4 font-medium text-foreground">
                                                        {r.customerName}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                        {r.email || r.phone || "—"}
                                                    </td>
                                                    <td className="py-2.5 pr-4">
                                                        <Badge
                                                            variant={(STATUS_COLORS[r.matchStatus] as any) ?? "outline"}
                                                            className="text-[10px]"
                                                        >
                                                            {r.matchStatus}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2.5 text-xs text-muted-foreground">{r.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---- ITEM SEARCH ---- */}
                <TabsContent value="search">
                    <Card className="mb-6">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Search className="h-4 w-4" /> Find Customers by Item
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                        Item name (e.g. "Wings")
                                    </label>
                                    <Input
                                        placeholder="Enter an item name…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && search_()}
                                        className="h-9"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                        Date range
                                    </label>
                                    <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                                        <SelectTrigger className="h-9 w-[140px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All time</SelectItem>
                                            <SelectItem value="today">Today</SelectItem>
                                            <SelectItem value="week">This Week</SelectItem>
                                            <SelectItem value="month">This Month</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button onClick={search_} disabled={loading || !search.trim()} className="h-9">
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Search className="h-4 w-4" />
                                    )}
                                    Find Customers
                                </Button>
                            </div>
                            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                        </CardContent>
                    </Card>

                    {result && (
                        <>
                            {result.itemFound ? (
                                <>
                                    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        <StatCard
                                            label="Customers"
                                            value={result.totalCustomers}
                                            icon={<Users className="h-4 w-4" />}
                                        />
                                        <StatCard
                                            label="Total Quantity"
                                            value={result.totalQuantity}
                                            icon={<Tag className="h-4 w-4" />}
                                        />
                                        <StatCard
                                            label="Total Revenue"
                                            value={money(result.totalRevenueCents)}
                                            icon={<Tag className="h-4 w-4" />}
                                        />
                                        <StatCard
                                            label="Item"
                                            value={result.itemName}
                                            icon={<Tag className="h-4 w-4" />}
                                        />
                                    </div>

                                    <Card className="mb-6">
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <CardTitle className="text-base">
                                                    Customers ({result.customers.length})
                                                </CardTitle>
                                                <Button
                                                    onClick={applyTags}
                                                    disabled={tagging || result.customers.length === 0}
                                                    className="h-9"
                                                >
                                                    {tagging ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Tag className="h-4 w-4" />
                                                    )}
                                                    Apply "Purchased: {result.itemName}" Tags
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {tagSummary && (
                                                <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                                                    <p className="font-medium">Tagging result</p>
                                                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                                        <SummaryStat label="Processed" value={tagSummary.processed} />
                                                        <SummaryStat label="Tags applied" value={tagSummary.tagsApplied} />
                                                        <SummaryStat label="Already tagged" value={tagSummary.alreadyTagged} />
                                                        <SummaryStat label="Verified" value={tagSummary.tagsVerified} />
                                                        <SummaryStat label="Skipped" value={tagSummary.skipped} />
                                                        <SummaryStat label="Errors" value={tagSummary.errors} />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                                            <th className="pb-2 pr-4 font-medium">Customer</th>
                                                            <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                                                            <th className="pb-2 pr-4 font-medium">Qty</th>
                                                            <th className="pb-2 pr-4 font-medium">Spent</th>
                                                            <th className="pb-2 pr-4 font-medium">Date</th>
                                                            <th className="pb-2 pr-4 font-medium">Order</th>
                                                            <th className="pb-2 pr-4 font-medium">Match</th>
                                                            <th className="pb-2 font-medium">Tag</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.customers.map((c, i) => (
                                                            <tr key={i} className="border-b border-border/50">
                                                                <td className="py-2.5 pr-4 font-medium text-foreground">
                                                                    {c.customerName}
                                                                </td>
                                                                <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                                    {c.email || c.phone || "—"}
                                                                </td>
                                                                <td className="py-2.5 pr-4">{c.quantity}</td>
                                                                <td className="py-2.5 pr-4 font-medium">
                                                                    {money(c.amountSpentCents)}
                                                                </td>
                                                                <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                                    {formatDateTime(c.purchaseDate)}
                                                                </td>
                                                                <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                                                                    {c.cloverOrderId}
                                                                </td>
                                                                <td className="py-2.5 pr-4">
                                                                    <Badge
                                                                        variant={(STATUS_COLORS[c.matchStatus] as any) ?? "outline"}
                                                                        className="text-[10px]"
                                                                    >
                                                                        {c.matchStatus}
                                                                    </Badge>
                                                                </td>
                                                                <td className="py-2.5 pr-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge
                                                                            variant={(STATUS_COLORS[c.tagStatus] as any) ?? "outline"}
                                                                            className="text-[10px]"
                                                                        >
                                                                            {c.tagStatus}
                                                                        </Badge>
                                                                        {c.ghlContactId && (
                                                                            <a
                                                                                href={crmContactUrl(c.ghlContactId)}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                                            >
                                                                                View in CRM
                                                                                <ExternalLink className="h-3 w-3" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <EmptyState
                                    title="No matching item found"
                                    description={`No purchased item matched "${search}". Make sure the item name matches a Clover item and that POS data has been synced.`}
                                />
                            )}
                        </>
                    )}

                    {!result && !loading && !error && (
                        <EmptyState
                            title="Search for an item to begin"
                            description="Enter an item name like “Wings” to find every customer who purchased it, then apply a purchase tag to their CRM contact."
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function StatCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: number | string;
    icon: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    {icon}
                </div>
                <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
            </CardContent>
        </Card>
    );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <span className="text-xs text-muted-foreground">{label}</span>
            <p className="font-semibold">{value}</p>
        </div>
    );
}
