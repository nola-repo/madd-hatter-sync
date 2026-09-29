import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { getLastSync } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncContext } from "@/hooks/use-sync-context";
import { formatDateTime } from "@/lib/integration/format";
import type { LastSyncRun } from "@/lib/integration/types";

/**
 * Automated sync status display. Fully hands-off — no manual buttons.
 * The background pipeline runs every 2 minutes automatically.
 * This component only shows the last sync status and refreshes it every 30s.
 */
export function SyncControl() {
    const getLastFn = useServerFn(getLastSync);
    const { setSyncing } = useSyncContext();
    const [lastRun, setLastRun] = useState<LastSyncRun>(null);

    const loadLast = useCallback(async () => {
        try {
            const res = await getLastFn();
            if (!res?.setupRequired) setLastRun(res.last);
        } catch {
            /* ignore */
        }
    }, [getLastFn]);

    // Load last sync metadata on mount and refresh every 30s automatically
    useEffect(() => {
        void loadLast();
        const interval = setInterval(() => void loadLast(), 30_000);
        return () => clearInterval(interval);
    }, [loadLast]);

    return (
        <div className="space-y-4">
            {/* Automated Sync Status — fully hands-off */}
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
                            Clover orders, items, customer matching, GHL contact creation, contact tags (
                            <code>Clover - Purchased: ...</code>), and POS Purchase Item records synchronize
                            automatically in the background. No manual steps required.
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
        </div>
    );
}
