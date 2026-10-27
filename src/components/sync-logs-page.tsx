import { useState, useEffect, useCallback } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Terminal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Search,
  ExternalLink,
  Code,
  Clock,
  Activity,
  Shield,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getSyncLogsFn } from "@/lib/integration/product-functions";
import { formatDateTime, relativeTime } from "@/lib/integration/format";
import type { SyncLogEntry } from "@/lib/integration/product-mapping.server";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";

export function SyncLogsPage() {
  const getLogsFn = useServerFn(getSyncLogsFn);
  const syncVersion = useSyncVersion();
  const { bump } = useSyncContext();

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [filterCorrelationId, setFilterCorrelationId] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  // Selected log for slide-over detail drawer
  const [selectedLog, setSelectedLog] = useState<SyncLogEntry | null>(null);

  const loadLogs = useCallback(
    async (corrId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLogsFn({
          data: { limit: 150, correlationId: corrId || undefined },
        });
        if (res?.setupRequired) {
          setError(`Setup required: ${res.missing?.join(", ")}`);
        } else {
          setLogs(res.logs);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load sync logs");
      } finally {
        setLoading(false);
      }
    },
    [getLogsFn],
  );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs, syncVersion]);

  // Client-side filtering
  const filteredLogs = logs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (
      operationFilter !== "all" &&
      !log.operation.toLowerCase().includes(operationFilter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const warningCount = logs.filter((l) => l.status === "warning" || l.status === "retry").length;

  // Unique operations for filter
  const operations = Array.from(new Set(logs.map((l) => l.operation)));

  // Helper to sanitize payload
  const sanitizeDetails = (obj: any): string => {
    if (!obj) return "{}";
    try {
      const clone = JSON.parse(JSON.stringify(obj));
      const maskKeys = ["key", "token", "secret", "authorization", "password", "apikey"];
      const walk = (target: any) => {
        if (typeof target !== "object" || target === null) return;
        for (const k of Object.keys(target)) {
          if (maskKeys.some((mk) => k.toLowerCase().includes(mk))) {
            target[k] = "••••••••••••";
          } else if (typeof target[k] === "object") {
            walk(target[k]);
          }
        }
      };
      walk(clone);
      return JSON.stringify(clone, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync Logs & Diagnostics"
        description="Real-time execution telemetry for Clover POS order ingestion, guest matching waterfall, and GHL CRM dispatches."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              bump();
              void loadLogs(filterCorrelationId);
            }}
            disabled={loading}
            className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`}
            />
            Refresh Telemetry
          </Button>
        }
      />

      {/* Diagnostic Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Logged Operations</span>
              <Terminal className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : logs.length}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Recent telemetry trace events</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Successful Executions</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
              {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : successCount}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Dispatched without errors</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Error Events</span>
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-red-400">
              {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : errorCount}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">API failures or timeouts</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Warnings / Retries</span>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
              {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : warningCount}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Handled retry operations</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-red-900/50 bg-red-950/20 text-red-200">
          <CardContent className="p-4 text-xs font-mono">{error}</CardContent>
        </Card>
      )}

      {/* Main Log Explorer */}
      <Card className="border-[#222226] bg-[#111113] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-zinc-400" />
              <CardTitle className="text-sm font-semibold text-white font-display">
                Telemetry Console ({filteredLogs.length})
              </CardTitle>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                <Input
                  placeholder="Filter by Correlation ID…"
                  value={filterCorrelationId}
                  onChange={(e) => setFilterCorrelationId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadLogs(filterCorrelationId)}
                  className="h-8 w-48 sm:w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B]"
                />
              </div>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                <SelectTrigger className="h-8 w-[130px] border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent className="border-[#27272A] bg-[#141417] text-[#E4E4E7]">
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>

              {operations.length > 0 && (
                <Select value={operationFilter} onValueChange={(v) => setOperationFilter(v)}>
                  <SelectTrigger className="h-8 w-[150px] border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]">
                    <SelectValue placeholder="Operation" />
                  </SelectTrigger>
                  <SelectContent className="border-[#27272A] bg-[#141417] text-[#E4E4E7]">
                    <SelectItem value="all">All Operations</SelectItem>
                    {operations.slice(0, 10).map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadLogs(filterCorrelationId)}
                disabled={loading}
                className="h-8 border-[#27272A] bg-[#141417] text-xs text-white hover:bg-[#1E1E24]"
              >
                Apply
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} columns={8} />
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                title="No sync logs found"
                description="Run a POS synchronization from the top bar or Settings to populate execution telemetry."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Operation</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Correlation ID</th>
                    <th className="py-3 px-4 font-medium">Clover Order</th>
                    <th className="py-3 px-4 font-medium">Endpoint</th>
                    <th className="py-3 px-4 font-medium">HTTP</th>
                    <th className="py-3 px-4 font-medium">Latency</th>
                    <th className="py-3 px-4 text-right font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1E]">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-[#161619] cursor-pointer transition-colors group font-mono text-[11px]"
                    >
                      <td className="py-3 px-4 text-[#A1A1AA] whitespace-nowrap font-sans text-xs">
                        {formatDateTime(new Date(log.createdAt).getTime())}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white group-hover:text-zinc-200 transition-colors">
                        {log.operation}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <LogStatusBadge status={log.status} />
                      </td>
                      <td className="py-3 px-4 text-[#71717A] truncate max-w-[120px]">
                        {log.correlationId}
                      </td>
                      <td className="py-3 px-4 text-[#D4D4D8]">{log.cloverOrderId || "—"}</td>
                      <td className="py-3 px-4 text-[#71717A] truncate max-w-[140px]">
                        {log.endpoint || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {log.httpStatus ? (
                          <span
                            className={
                              log.httpStatus >= 200 && log.httpStatus < 300
                                ? "text-emerald-400"
                                : "text-red-400"
                            }
                          >
                            {log.httpStatus}
                          </span>
                        ) : (
                          <span className="text-[#52525B]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#A1A1AA]">
                        {log.durationMs !== null ? `${log.durationMs}ms` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-[#A1A1AA] hover:text-white hover:bg-zinc-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                        >
                          Trace
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slide-over Diagnostic Log Drawer */}
      <Sheet
        open={!!selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-xl bg-[#0E0E11] border-[#222226] text-[#F5F5F5] p-6 overflow-y-auto">
          {selectedLog && (
            <>
              <SheetHeader className="pb-4 border-b border-[#222226]">
                <div className="flex items-center gap-2">
                  <LogStatusBadge status={selectedLog.status} />
                  <span className="text-xs text-[#71717A]">·</span>
                  <span className="font-mono text-xs text-[#A1A1AA]">
                    {selectedLog.correlationId}
                  </span>
                </div>
                <SheetTitle className="text-xl font-bold font-display text-white mt-1">
                  {selectedLog.operation}
                </SheetTitle>
                <SheetDescription className="text-xs text-[#71717A]">
                  Recorded at {formatDateTime(new Date(selectedLog.createdAt).getTime())}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* HTTP / Execution Strip */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#141417] border border-[#222226] text-xs">
                  <div>
                    <span className="text-[#71717A] text-[10px] uppercase">Method & Status</span>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {selectedLog.httpMethod ?? "INTERNAL"} · {selectedLog.httpStatus ?? 200}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A] text-[10px] uppercase">Latency</span>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {selectedLog.durationMs !== null ? `${selectedLog.durationMs}ms` : "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A] text-[10px] uppercase">Retries</span>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {selectedLog.retryCount ?? 0}
                    </div>
                  </div>
                </div>

                {/* Target Entity Identifiers */}
                <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 space-y-2 text-xs">
                  <div className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider font-display">
                    Correlated Identifiers
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div>
                      <span className="text-[#71717A]">Clover Order:</span>
                      <div className="text-white mt-0.5">{selectedLog.cloverOrderId ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-[#71717A]">Clover Customer:</span>
                      <div className="text-white mt-0.5">{selectedLog.cloverCustomerId ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-[#71717A]">GHL Contact ID:</span>
                      <div className="text-white mt-0.5">{selectedLog.ghlContactId ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-[#71717A]">Purchase Tag:</span>
                      <div className="text-white mt-0.5">{selectedLog.ghlTagName ?? "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Error trace if present */}
                {selectedLog.errorMessage && (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 font-display">
                      <XCircle className="h-4 w-4" />
                      Error Trace
                    </div>
                    <p className="text-xs font-mono text-red-200 break-words">
                      {selectedLog.errorMessage}
                    </p>
                  </div>
                )}

                {/* Structured Payload Viewer */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#A1A1AA] uppercase tracking-wider font-display flex items-center gap-1.5">
                      <Code className="h-3.5 w-3.5 text-zinc-400" />
                      Structured Payload (Sanitized)
                    </span>
                  </div>
                  <div className="rounded-xl border border-[#222226] bg-[#0A0A0C] p-3 overflow-x-auto max-h-72">
                    <pre className="text-[11px] font-mono text-[#E4E4E7] leading-relaxed">
                      {sanitizeDetails(selectedLog.details)}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LogStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
      >
        Success
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="border-red-800/40 bg-red-950/40 text-red-400 text-[10px]">
        Error
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge
        variant="outline"
        className="border-amber-800/40 bg-amber-950/40 text-amber-400 text-[10px]"
      >
        Warning
      </Badge>
    );
  }
  if (status === "retry") {
    return (
      <Badge
        variant="outline"
        className="border-purple-800/40 bg-purple-950/40 text-purple-400 text-[10px]"
      >
        Retry
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]">
      {status}
    </Badge>
  );
}
