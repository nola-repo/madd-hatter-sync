import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Loader2, TriangleAlert, CheckCircle2, UserCheck } from "lucide-react";
import {
    refreshPos,
    getLastSync,
    processPendingPurchasesFn,
    syncAllPaidOrdersToCustomObjectsFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncContext } from "@/hooks/use-sync-context";
import { formatDateTime } from "@/lib/integration/format";
import type { SyncRunSummary, LastSyncRun } from "@/lib/integration/types";

type Range = "today" | "week" | "month" | "3d" | "7d" | "30d" | "all";

/**
 * The ONE global POS synchronization control. Lives only in Settings.
 * After a successful sync it calls `bump()` on the global sync context so
 * every page in the app re-fetches its data from the canonical Supabase
 * layer — no per-page refresh buttons needed.
 */
export function SyncControl() {
    const refreshFn = useServerFn(refreshPos);
    const getLastFn = useServerFn(getLastSync);
    const processMappingsFn = useServerFn(processPendingPurchasesFn);
    const syncCustomObjectsFn = useServerFn(syncAllPaidOrdersToCustomObjectsFn);
    const { bump, setSyncing } = useSyncContext();

    const [range, setRange] = useState<Range>("month");
    const [loading, setLoading] = useState(false);
    const [mappingLoading, setMappingLoading] = useState(false);
    const [customObjectsLoading, setCustomObjectsLoading] = useState(false);
    const [summary, setSummary] = useState<SyncRunSummary | null>(null);
    const [mappingSummary, setMappingSummary] = useState<any>(null);
    const [customObjectsSummary, setCustomObjectsSummary] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<LastSyncRun>(null);

    const loadLast = useCallback(async () => {
        try {
            const res = await getLastFn();
            if (!res?.setupRequired) setLastRun(res.last);
        } catch {
            /* ignore */
        }
    }, [getLastFn]);

    // Load last sync metadata on mount
    useEffect(() => {
        void loadLast();
    }, [loadLast]);

    const doRefresh = useCallback(async () => {
        setLoading(true);
        setSyncing(true);
        setError(null);
        setSummary(null);
        try {
            const res = await refreshFn({ data: { kind: "incremental", range } });
            if (res?.setupRequired) {
                setError(`Setup required: ${(res as any).missing?.join(", ")}`);
            } else {
                setSummary(res.summary);
                await loadLast();
                // Invalidate every page's cache so the whole app reflects fresh data.
                bump();
            }
        } catch (e: any) {
            setError(e?.message ?? "Sync failed");
        } finally {
            setLoading(false);
            setSyncing(false);
        }
    }, [refreshFn, range, loadLast, bump, setSyncing]);

    const doProcessMappings = useCallback(async () => {
        setMappingLoading(true);
        setError(null);
        setMappingSummary(null);
        try {
            const res = await processMappingsFn({ data: { limit: 100 } });
            setMappingSummary(res);
            bump();
        } catch (e: any) {
            setError(e?.message ?? "Mapping process failed");
        } finally {
            setMappingLoading(false);
        }
    }, [processMappingsFn, bump]);

    const doSyncCustomObjects = useCallback(async () => {
        setCustomObjectsLoading(true);
        setError(null);
        setCustomObjectsSummary(null);
        try {
            const res = await syncCustomObjectsFn({ data: { limit: 200 } });
            setCustomObjectsSummary(res);
            bump();
        } catch (e: any) {
            setError(e?.message ?? "Custom object sync failed");
        } finally {
            setCustomObjectsLoading(false);
        }
    }, [syncCustomObjectsFn, bump]);

    return (
        <div className="space-y-4">
            {/* Automated Sync Status Card */}
            <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="font-semibold text-sm">Automated Pipeline: Active</span>
                            <Badge variant="outline" className="text-[10px]">
                                Real-Time Sync Every 2 Min
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Clover orders, items, customer matching, contact tags (
                            <code>Clover - Purchased: ...</code>), and POS Purchase Item records synchronize
                            automatically in the background.
                        </p>
                    </div>
                    {lastRun?.finishedAt && (
                        <div className="text-xs text-muted-foreground sm:text-right">
                            <div>
                                Last sync:{" "}
                                <span className="font-medium text-foreground">
                                    {formatDateTime(new Date(lastRun.finishedAt).getTime())}
                                </span>
                            </div>
                            <div className="mt-0.5">
                                <Badge
                                    variant={lastRun.status === "completed" ? "default" : "destructive"}
                                    className="text-[10px]"
                                >
                                    {lastRun.status ?? "—"}
                                </Badge>{" "}
                                · {lastRun.ordersUpserted ?? 0} orders · {lastRun.customersUpserted ?? 0} customers
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Manual Diagnostic & Trigger Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-medium text-muted-foreground mr-1">Manual Diagnostics:</span>
                <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={doRefresh}
                    disabled={loading || mappingLoading}
                >
                    {loading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {loading ? "Syncing Clover..." : "Run Clover Sync Now"}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={doProcessMappings}
                    disabled={loading || mappingLoading || customObjectsLoading}
                >
                    {mappingLoading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {mappingLoading ? "Matching..." : "Process Customer Tags"}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={doSyncCustomObjects}
                    disabled={loading || mappingLoading || customObjectsLoading}
                >
                    {customObjectsLoading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {customObjectsLoading ? "Syncing..." : "Sync Custom Objects"}
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={async () => {
                        try {
                            const res = await fetch("/api/diag");
                            const data = await res.json();
                            const epSample = data.customObjectsRecordsCheck?.endpoints
                                ?.map((e: any) => `${e.url} => ${e.status}`)
                                .join("\n");
                            alert(
                                `Live CRM Check:\nLocation Status: ${data.locationCheck?.status}\nContacts Status: ${data.contactsListCheck?.status}\nEndpoints:\n${epSample}`,
                            );
                        } catch (e: any) {
                            alert(`Error: ${e?.message}`);
                        }
                    }}
                >
                    Verify Live CRM API
                </Button>
            </div>
            {lastRun?.finishedAt && (
                <div className="text-xs text-muted-foreground">
                    <div>
                        Last sync:{" "}
                        <span className="font-medium text-foreground">
                            {formatDateTime(new Date(lastRun.finishedAt).getTime())}
                        </span>
                    </div>
                    <div className="mt-0.5">
                        Status:{" "}
                        <Badge
                            variant={lastRun.status === "completed" ? "default" : "destructive"}
                            className="text-[10px]"
                        >
                            {lastRun.status ?? "—"}
                        </Badge>{" "}
                        · {lastRun.ordersUpserted ?? 0} orders · {lastRun.customersUpserted ?? 0} customers
                    </div>
                </div>
            )}

            {error && (
                <Alert variant="destructive">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {customObjectsSummary && (
                <Alert>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertDescription>
                        <div className="space-y-1">
                            <div className="font-medium">
                                POS Purchase Items sync complete: {customObjectsSummary.syncedOrders} /{" "}
                                {customObjectsSummary.totalOrders} paid orders synced (
                                {customObjectsSummary.recordsCreated} custom object purchase item records created in
                                CRM).
                            </div>
                            {customObjectsSummary.errors > 0 && (
                                <div className="text-xs text-destructive">
                                    {customObjectsSummary.errors} error(s) encountered during record creation.
                                </div>
                            )}
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {summary && (
                <Alert variant={summary.status === "failed" ? "destructive" : "default"}>
                    {summary.status === "failed" ? (
                        <TriangleAlert className="h-4 w-4" />
                    ) : (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                    <AlertDescription>
                        <div className="space-y-2">
                            <div className="font-medium">
                                {summary.status === "completed"
                                    ? summary.errors.length > 0
                                        ? "Sync completed with warnings."
                                        : "Sync completed successfully."
                                    : "Sync failed."}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                    Orders: {summary.ordersUpserted}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                    Items: {summary.orderItemsUpserted}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                    Customers: {summary.customersUpserted}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                    Payments: {summary.paymentsUpserted}
                                </Badge>
                                {summary.refundsFetched > 0 && (
                                    <Badge variant="secondary" className="text-[10px]">
                                        Refunds: {summary.refundsFetched}
                                    </Badge>
                                )}
                                <Badge variant="secondary" className="text-[10px]">
                                    Products: {summary.productsUpserted}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                    Categories: {summary.categoriesUpserted}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                    Employees: {summary.employeesUpserted}
                                </Badge>
                            </div>
                            {(summary.crmOrdersSynced > 0 ||
                                summary.crmOrdersHeld > 0 ||
                                summary.crmOrdersErrors > 0) && (
                                    <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                                        <Badge variant="default" className="text-[10px]">
                                            CRM synced: {summary.crmOrdersSynced}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[10px]">
                                            CRM held: {summary.crmOrdersHeld}
                                        </Badge>
                                        {summary.crmContactsCreated > 0 && (
                                            <Badge variant="secondary" className="text-[10px]">
                                                Contacts created: {summary.crmContactsCreated}
                                            </Badge>
                                        )}
                                        {summary.crmPurchaseRecordsCreated > 0 && (
                                            <Badge variant="secondary" className="text-[10px]">
                                                Purchase records: {summary.crmPurchaseRecordsCreated}
                                            </Badge>
                                        )}
                                        {summary.crmOrdersErrors > 0 && (
                                            <Badge variant="destructive" className="text-[10px]">
                                                CRM errors: {summary.crmOrdersErrors}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            {summary.errors.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    {summary.errors.length} error(s): {summary.errors.slice(0, 3).join(" · ")}
                                    {summary.errors.length > 3 && "…"}
                                </div>
                            )}
                            {summary.reconciliation && (
                                <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                                    <div className="font-medium text-foreground">Reconciliation (vs Clover)</div>
                                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                                        <span>Range: {summary.reconciliation.rangeLabel}</span>
                                        <span>Pages: {summary.reconciliation.pagesFetched}</span>
                                        <span>Orders: {summary.reconciliation.ordersFetched}</span>
                                        <span>Paid: {summary.reconciliation.paidOrderCount}</span>
                                        <span>Payments: {summary.reconciliation.paymentsFetched}</span>
                                        <span>Refunds: {summary.reconciliation.refundsFetched}</span>
                                        <span>Voids: {summary.reconciliation.voidsFetched}</span>
                                        <span>Items sold: {summary.reconciliation.itemsSold}</span>
                                        <span>
                                            Net sales: ${(summary.reconciliation.netSalesCents / 100).toFixed(2)}
                                        </span>
                                        <span>Gross: ${(summary.reconciliation.grossSalesCents / 100).toFixed(2)}</span>
                                        <span>
                                            Discounts: ${(summary.reconciliation.discountsCents / 100).toFixed(2)}
                                        </span>
                                        <span>Taxes: ${(summary.reconciliation.taxesCents / 100).toFixed(2)}</span>
                                        <span>Tips: ${(summary.reconciliation.tipsCents / 100).toFixed(2)}</span>
                                        <span>
                                            Svc charges: ${(summary.reconciliation.serviceChargesCents / 100).toFixed(2)}
                                        </span>
                                        <span>
                                            Refund amt: ${(summary.reconciliation.refundAmountCents / 100).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
