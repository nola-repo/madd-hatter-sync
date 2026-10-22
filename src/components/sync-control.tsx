import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLastSync, refreshPos } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncContext } from "@/hooks/use-sync-context";
import { formatDateTime, relativeTime } from "@/lib/integration/format";
import type { LastSyncRun } from "@/lib/integration/types";
import { RefreshCw, CheckCircle2, ShieldCheck, Clock, Layers } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function SyncControl() {
    const getLastFn = useServerFn(getLastSync);
    const refreshPosFn = useServerFn(refreshPos);
    const { bump, isSyncing, setSyncing } = useSyncContext();

    const [lastRun, setLastRun] = useState<LastSyncRun>(null);
    const [manualSyncing, setManualSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);

    const loadLast = useCallback(async () => {
        try {
            const res = await getLastFn();
            if (!res?.setupRequired) setLastRun(res.last);
        } catch {
            /* ignore */
        }
    }, [getLastFn]);

    useEffect(() => {
        void loadLast();
        const interval = setInterval(() => void loadLast(), 20_000);
        return () => clearInterval(interval);
    }, [loadLast]);

    const handleRunManual = async () => {
        if (manualSyncing || isSyncing) return;
        setManualSyncing(true);
        setSyncing(true);
        setSyncMessage(null);
        try {
            const res = await refreshPosFn({ data: { kind: "incremental" } });
            if (!res?.setupRequired) {
                setSyncMessage(
                    `Synchronized ${res.summary?.ordersUpserted ?? 0} orders and ${res.summary?.customersUpserted ?? 0} guests successfully.`,
                );
            }
            bump();
            await loadLast();
        } catch (e: any) {
            setSyncMessage(`Sync failed: ${e?.message ?? String(e)}`);
        } finally {
            setManualSyncing(false);
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[#222226] bg-[#111113] p-5 shadow-lg">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                            <span className="font-bold text-sm text-white font-display">
                                Automated POS Pipeline: Active
                            </span>
                            <Badge
                                variant="outline"
                                className="text-[10px] font-mono border-emerald-800/40 bg-emerald-950/40 text-emerald-400"
                            >
                                Every 2 Min
                            </Badge>
                        </div>
                        <p className="text-xs text-[#A1A1AA] max-w-xl leading-relaxed">
                            Clover orders, item catalogs, customer matching waterfall, GoHighLevel contact creation, and custom POS purchase records synchronize automatically in the background.
                        </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2 shrink-0">
                        <Button
                            onClick={handleRunManual}
                            disabled={manualSyncing || isSyncing}
                            className="bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs h-9 gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                        >
                            <RefreshCw
                                className={`h-3.5 w-3.5 ${manualSyncing || isSyncing ? "animate-spin" : ""}`}
                            />
                            {manualSyncing || isSyncing ? "Ingesting Clover POS…" : "Trigger Manual Sync"}
                        </Button>
                        <Link
                            to="/admin/logs"
                            className="text-[11px] text-[#71717A] hover:text-white underline underline-offset-4"
                        >
                            View Real-Time Sync Logs
                        </Link>
                    </div>
                </div>

                {syncMessage && (
                    <div className="mt-4 rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-3 text-xs text-emerald-300 font-mono">
                        {syncMessage}
                    </div>
                )}

                {lastRun?.finishedAt && (
                    <div className="mt-4 pt-4 border-t border-[#1E1E22] flex flex-wrap items-center justify-between gap-2 text-xs text-[#71717A]">
                        <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-zinc-500" />
                            <span>
                                Last completed sync:{" "}
                                <strong className="text-white font-medium">
                                    {formatDateTime(new Date(lastRun.finishedAt).getTime())}
                                </strong>{" "}
                                ({relativeTime(new Date(lastRun.finishedAt).getTime())})
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="outline"
                                className={
                                    lastRun.status === "completed"
                                        ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                        : "border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
                                }
                            >
                                {lastRun.status ?? "Finished"}
                            </Badge>
                            <span className="font-mono text-[#A1A1AA]">
                                {lastRun.ordersUpserted ?? 0} orders · {lastRun.customersUpserted ?? 0} guests
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
