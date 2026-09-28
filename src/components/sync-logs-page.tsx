import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
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
import { Terminal, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getSyncLogsFn } from "@/lib/integration/product-functions";
import { formatDateTime } from "@/lib/integration/format";
import type { SyncLogEntry } from "@/lib/integration/product-mapping.server";

export function SyncLogsPage() {
    const getLogsFn = useServerFn(getSyncLogsFn);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<SyncLogEntry[]>([]);
    const [filterCorrelationId, setFilterCorrelationId] = useState("");
    const [error, setError] = useState<string | null>(null);

    const loadLogs = async (corrId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await getLogsFn({ data: { limit: 100, correlationId: corrId || undefined } });
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
    };

    useEffect(() => {
        void loadLogs();
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Sync Execution Logs"
                description="Detailed step-by-step correlation logs for every Clover order, customer match, tag application, and Custom Object sync."
            />

            <Card>
                <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Input
                            placeholder="Filter by Correlation ID..."
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
                    <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh Logs
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Card className="border-destructive bg-destructive/10">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-primary" />
                        Execution Log Entries
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
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
                                        <TableHead>Clover Order ID</TableHead>
                                        <TableHead>Endpoint / Method</TableHead>
                                        <TableHead>HTTP</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Error / Details</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {formatDateTime(log.createdAt)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold">
                                                {log.operation}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        log.status === "success"
                                                            ? "default"
                                                            : log.status === "error"
                                                                ? "destructive"
                                                                : "outline"
                                                    }
                                                    className={
                                                        log.status === "success"
                                                            ? "bg-emerald-600 text-white text-[11px]"
                                                            : "text-[11px]"
                                                    }
                                                >
                                                    {log.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                                                {log.correlationId}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {log.cloverOrderId || "—"}
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
                                            <TableCell className="text-xs font-mono">{log.httpStatus ?? "—"}</TableCell>
                                            <TableCell className="text-xs font-mono">
                                                {log.durationMs ? `${log.durationMs}ms` : "—"}
                                            </TableCell>
                                            <TableCell className="text-xs max-w-xs truncate">
                                                {log.errorMessage ? (
                                                    <span className="text-destructive font-mono">{log.errorMessage}</span>
                                                ) : log.details ? (
                                                    <span className="text-muted-foreground font-mono">
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
                </CardContent>
            </Card>
        </div>
    );
}
