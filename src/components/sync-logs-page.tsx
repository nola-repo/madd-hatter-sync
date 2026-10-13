import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Terminal, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getSyncLogsFn } from "@/lib/integration/product-functions";
import { formatDateTime, relativeTime } from "@/lib/integration/format";
import { usePagination, Pager } from "@/components/purchase-mapping/pagination";
import type { SyncLogEntry } from "@/lib/integration/product-mapping.server";

const POLL_INTERVAL_MS = 15_000;

export function SyncLogsPage() {
  const getLogsFn = useServerFn(getSyncLogsFn);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [filterCorrelationId, setFilterCorrelationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 15-per-page pagination, resets to page 1 on each fresh load.
  const {
    page,
    setPage,
    totalPages,
    pagedRows: pagedLogs,
    total,
  } = usePagination<SyncLogEntry>(logs, [logs.length]);

  const loadLogs = useCallback(
    async (corrId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLogsFn({ data: { limit: 100, correlationId: corrId || undefined } });
        if (res?.setupRequired) {
          setError(`Setup required: ${res.missing?.join(", ")}`);
        } else {
          setLogs(res.logs);
          setLastRefreshed(Date.now());
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load sync logs");
      } finally {
        setLoading(false);
      }
    },
    [getLogsFn],
  );

  // Initial load + controlled polling for freshness (not just one-time fetch).
  useEffect(() => {
    void loadLogs();
    pollingRef.current = setInterval(() => {
      void loadLogs(filterCorrelationId || undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync stats — green for success metrics, amber for pending, red for errors.
  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const pendingCount = logs.filter(
    (l) => l.status === "info" || l.status === "retry" || l.status === "warning",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync Execution Logs"
        description="Step-by-step correlation logs for every Clover order, customer match, tag application, and Custom Object sync."
      />

      {/* Refresh status bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {lastRefreshed ? (
              <span>
                Last refreshed{" "}
                <strong className="text-foreground">{relativeTime(lastRefreshed)}</strong> ·
                auto-refreshing every {POLL_INTERVAL_MS / 1000}s
              </span>
            ) : (
              <span>Loading…</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadLogs(filterCorrelationId)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Logs
          </Button>
        </CardContent>
      </Card>

      {/* Sync stats — green for successful sync activity */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Successful Steps"
          value={successCount}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <StatTile
          label="Pending / Info"
          value={pendingCount}
          icon={<Clock className="h-4 w-4" />}
          tone="warning"
        />
        <StatTile
          label="Errors"
          value={errorCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="error"
        />
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="Filter by Correlation ID…"
              value={filterCorrelationId}
              onChange={(e) => setFilterCorrelationId(e.target.value)}
              className="w-full sm:w-64"
            />
            <Button
              variant="outline"
              onClick={() => void loadLogs(filterCorrelationId)}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Filter"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            Execution Log Entries
            <Badge variant="outline" className="ml-1 text-xs">
              {logs.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sync logs recorded yet. Run a synchronization to view correlation logs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Correlation ID</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Error / Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(new Date(log.createdAt).getTime())}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {log.operation}
                      </TableCell>
                      <TableCell>
                        <LogStatusBadge status={log.status} />
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {log.correlationId}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.cloverOrderId ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.httpMethod && log.endpoint ? (
                          <span>
                            <span className="font-semibold">{log.httpMethod}</span> {log.endpoint}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.httpStatus ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.durationMs ? `${log.durationMs}ms` : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {log.errorMessage ? (
                          <span className="font-mono text-destructive">{log.errorMessage}</span>
                        ) : log.details ? (
                          <span className="font-mono text-muted-foreground">
                            {JSON.stringify(log.details).slice(0, 60)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="px-4 pb-4">
            <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm font-medium text-muted-foreground">{description}</p>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "success" | "warning" | "error";
}) {
  const styles: Record<string, string> = {
    success: "border-success/25 text-foreground",
    warning: "border-warning/30 text-foreground",
    error: "border-destructive/30 text-foreground",
  };
  const bg: Record<string, string> = {
    success: "color-mix(in oklab, var(--success) 8%, var(--card))",
    warning: "color-mix(in oklab, var(--warning) 10%, var(--card))",
    error: "color-mix(in oklab, var(--destructive) 8%, var(--card))",
  };
  const iconColor: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    error: "text-destructive",
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[tone]}`} style={{ backgroundColor: bg[tone] }}>
      <div className="flex items-center gap-2">
        <span className={iconColor[tone]}>{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function LogStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: "Success", className: "bg-success/15 text-success hover:bg-success/20" },
    error: {
      label: "Error",
      className: "bg-destructive/15 text-destructive hover:bg-destructive/20",
    },
    warning: { label: "Warning", className: "bg-warning/20 text-warning hover:bg-warning/25" },
    retry: { label: "Retry", className: "bg-warning/15 text-warning hover:bg-warning/20" },
    info: { label: "Info", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={`text-[10px] ${s.className}`}>
      {s.label}
    </Badge>
  );
}
