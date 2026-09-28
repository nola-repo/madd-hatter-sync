import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SchemaSection } from "@/components/schema-section";
import { DiagnosticPayload } from "@/components/diagnostic-payload";
import { SyncControl } from "@/components/sync-control";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getConnectionStatus, getSchemaStatus } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import type {
    ConnectionStatus,
    CloverConnectionDetail,
    GhlConnectionDetail,
} from "@/lib/integration/types";

export function SettingsPage() {
    const getStatusFn = useServerFn(getConnectionStatus);
    const getSchemaFn = useServerFn(getSchemaStatus);

    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState<string[] | null>(null);
    const [schema, setSchema] = useState<any>(null);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        setSetupRequired(null);
        try {
            const res = await getStatusFn();
            if (res?.setupRequired) {
                setSetupRequired((res as any).missing);
            } else {
                setStatus(res as ConnectionStatus);
            }
        } catch (e: any) {
            setSetupRequired([e?.message ?? "Failed to load status"]);
        } finally {
            setStatusLoading(false);
        }
    }, [getStatusFn]);

    const loadSchema = useCallback(async () => {
        try {
            const res = await getSchemaFn();
            if (!res?.setupRequired) setSchema(res);
        } catch {
            /* schema optional */
        }
    }, [getSchemaFn]);

    useEffect(() => {
        loadStatus();
        loadSchema();
    }, [loadStatus, loadSchema]);

    if (setupRequired) {
        return (
            <div>
                <PageHeader title="Settings" description="Connection and integration configuration" />
                <Alert variant="destructive">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertTitle>Setup required</AlertTitle>
                    <AlertDescription>
                        Add these secrets in the Secrets interface, then reload:{" "}
                        <strong>
                            {(setupRequired as string[]).filter((s) => !s.includes("Failed")).join(", ")}
                        </strong>
                        . Full instructions are on the{" "}
                        <a className="underline" href="/admin/setup">
                            Setup
                        </a>{" "}
                        page.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="Settings"
                description="Connection and integration configuration"
                actions={
                    <Button variant="outline" size="sm" onClick={loadStatus} disabled={statusLoading}>
                        {statusLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Refresh
                    </Button>
                }
            />

            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">POS Data Synchronization</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-3 text-xs text-muted-foreground">
                        This is the single manual sync action for the entire application. After a successful
                        sync, every page (Home, Orders, Transactions, Reports, Customers, Items) automatically
                        refreshes from the canonical database.
                    </p>
                    <SyncControl />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Connections</CardTitle>
                </CardHeader>
                <CardContent>
                    {statusLoading && !status ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Checking connections…
                        </div>
                    ) : status ? (
                        <div className="grid gap-3 lg:grid-cols-3">
                            <ConnectionCard label="Supabase" status={status.supabase} />
                            <CloverConnectionCard status={status.clover} />
                            <GhlConnectionCard status={status.ghl} />
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Connection details unavailable.</div>
                    )}
                </CardContent>
            </Card>

            {schema && (
                <Card className="mt-4">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">CRM Custom Object: “POS Purchase Item”</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <SchemaSection schema={schema} locationId={status?.ghl?.locationId} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ConnectionCard({
    label,
    status,
}: {
    label: string;
    status: { connected: boolean; detail: string };
}) {
    return (
        <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2">
                {status.connected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground">{label}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                    {status.connected ? "Connected" : "Error"}
                </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{status.detail}</p>
        </div>
    );
}

function CloverConnectionCard({ status }: { status: CloverConnectionDetail }) {
    const probeRow = (label: string, ok: boolean | null) => (
        <div className="flex items-center gap-1.5 text-xs">
            {ok === true ? (
                <CheckCircle2 className="h-3 w-3 text-primary" />
            ) : ok === false ? (
                <XCircle className="h-3 w-3 text-destructive" />
            ) : (
                <Loader2 className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={ok === false ? "text-destructive" : "text-muted-foreground"}>{label}</span>
        </div>
    );
    return (
        <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2">
                {status.connected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground">Clover</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                    {status.environment}
                </Badge>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <div>
                    Merchant:{" "}
                    <span className="font-medium text-foreground">{status.merchantName ?? "—"}</span>
                </div>
                <div>Merchant ID: {status.merchantId}</div>
                <div>HTTP: {status.httpStatus ?? "—"}</div>
                <div className="truncate">API: {status.baseUrl}</div>
            </div>
            {status.connected && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                    {probeRow("Merchant API", status.validation.merchantApi)}
                    {probeRow("Orders API", status.validation.ordersApi)}
                    {probeRow("Customers API", status.validation.customersApi)}
                    {probeRow("Payments API", status.validation.paymentsApi)}
                    {probeRow("Inventory API", status.validation.inventoryApi)}
                </div>
            )}
            {!status.connected && <p className="mt-2 text-xs text-destructive">{status.detail}</p>}
            <DiagnosticPayload d={status.diagnostic} />
        </div>
    );
}

function GhlConnectionCard({ status }: { status: GhlConnectionDetail }) {
    return (
        <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2">
                {status.connected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground">CRM Sub-Account</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                    PIT
                </Badge>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <div>Location ID: {status.locationId}</div>
                <div>HTTP: {status.httpStatus ?? "—"}</div>
                {status.errorCode && <div className="text-destructive">Code: {status.errorCode}</div>}
            </div>
            <p
                className={`mt-2 text-xs ${status.connected ? "text-muted-foreground" : "text-destructive"}`}
            >
                {status.detail}
            </p>
            <DiagnosticPayload d={status.diagnostic} />
        </div>
    );
}
