import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SchemaSection } from "@/components/schema-section";
import { DiagnosticPayload } from "@/components/diagnostic-payload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Search,
    RefreshCw,
    TriangleAlert,
    UserCheck,
    UserPlus,
    HelpCircle,
    UserX,
    Zap,
} from "lucide-react";
import type {
    ConnectionStatus,
    CloverConnectionDetail,
    GhlConnectionDetail,
    OrderPreview,
    SyncResult,
} from "@/lib/integration/types";

type Props = {
    orderId: string;
    setOrderId: (v: string) => void;
    getStatus: () => Promise<any>;
    getSchema: () => Promise<any>;
    preview: (args: { data: { orderId: string } }) => Promise<any>;
    sync: (args: { data: { orderId: string } }) => Promise<any>;
};

export function SyncDashboard({ orderId, setOrderId, getStatus, getSchema, preview, sync }: Props) {
    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState<string[] | null>(null);

    const [schema, setSchema] = useState<any>(null);
    const [previewData, setPreviewData] = useState<OrderPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [syncLoading, setSyncLoading] = useState(false);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        setSetupRequired(null);
        try {
            const res = await getStatus();
            if (res?.setupRequired) {
                setSetupRequired(res.missing);
            } else {
                setStatus(res);
            }
        } catch (e: any) {
            setPreviewError(e?.message ?? "Failed to load status");
        } finally {
            setStatusLoading(false);
        }
    }, [getStatus]);

    const loadSchema = useCallback(async () => {
        try {
            const res = await getSchema();
            if (!res?.setupRequired) setSchema(res);
        } catch {
            /* schema optional for status */
        }
    }, [getSchema]);

    useEffect(() => {
        loadStatus();
        loadSchema();
    }, [loadStatus, loadSchema]);

    async function onPreview(e: React.FormEvent) {
        e.preventDefault();
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewData(null);
        setSyncResult(null);
        try {
            const res = await preview({ data: { orderId } });
            if (res?.setupRequired) {
                setSetupRequired(res.missing);
            } else {
                setPreviewData(res.preview);
            }
        } catch (e: any) {
            setPreviewError(e?.message ?? "Failed to preview order");
        } finally {
            setPreviewLoading(false);
        }
    }

    async function onSync() {
        if (!previewData) return;
        setSyncLoading(true);
        setSyncResult(null);
        try {
            const res = await sync({ data: { orderId } });
            if (res?.setupRequired) {
                setSetupRequired(res.missing);
            } else {
                setSyncResult(res.result);
                // refresh preview to reflect post-sync state
                const p = await preview({ data: { orderId } });
                if (!p?.setupRequired) setPreviewData(p.preview);
            }
        } catch (e: any) {
            setSyncResult({
                outcome: "error",
                message: "Sync failed.",
                ghlContactId: null,
                matchedBy: null,
                purchaseRecordIds: [],
                itemsSynced: 0,
                itemsHeld: 0,
                reviewReason: null,
                error: e?.message ?? "Unknown error",
            });
        } finally {
            setSyncLoading(false);
        }
    }

    if (setupRequired) {
        return (
            <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Setup required</AlertTitle>
                <AlertDescription>
                    Add these secrets in the Secrets interface, then reload:{" "}
                    <strong>{setupRequired.join(", ")}</strong>. Full instructions are on the{" "}
                    <a className="underline" href="/admin/setup">
                        Setup
                    </a>{" "}
                    page.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Sync Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                    Preview a Clover sandbox order, then sync eligible purchases to CRM.
                </p>
            </div>

            {/* Connection status */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-base">Connections</CardTitle>
                    <Button variant="ghost" size="sm" onClick={loadStatus} disabled={statusLoading}>
                        {statusLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {statusLoading && !status ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Checking connections…
                        </div>
                    ) : status ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                            <ConnectionCard label="Supabase" status={status.supabase} />
                            <CloverConnectionCard status={status.clover} />
                            <GhlConnectionCard status={status.ghl} />
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            Connection details currently unavailable. Click &quot;Check now&quot; to test.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Schema status */}
            {schema && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">CRM Custom Object: “POS Purchase Item”</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <SchemaSection schema={schema} locationId={status?.ghl?.locationId} />
                    </CardContent>
                </Card>
            )}

            {/* Order input */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Clover Order Preview</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onPreview} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-2">
                            <Label htmlFor="orderId">Clover sandbox order ID</Label>
                            <Input
                                id="orderId"
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                placeholder="e.g. ABC1234XYZ"
                                required
                            />
                        </div>
                        <Button type="submit" disabled={previewLoading || !orderId}>
                            {previewLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Search className="mr-2 h-4 w-4" />
                            )}
                            Preview
                        </Button>
                    </form>
                    {previewError && (
                        <Alert variant="destructive" className="mt-4">
                            <TriangleAlert className="h-4 w-4" />
                            <AlertDescription>{previewError}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* Preview results */}
            {previewData && (
                <div className="space-y-4">
                    {/* Customer match */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Customer Match</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <MatchBadge decision={previewData.match.decision} reason={previewData.match.reason} />
                            {previewData.match.candidates.length > 0 && (
                                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                                    <div className="mb-1 font-medium text-foreground">Candidates found</div>
                                    <ul className="space-y-1 text-muted-foreground">
                                        {previewData.match.candidates.map((c) => (
                                            <li key={c.id}>
                                                {c.firstName} {c.lastName} — {c.email || c.phone || "no contact info"}{" "}
                                                <Badge variant="secondary" className="ml-1 text-[10px]">
                                                    {c.matchedBy}
                                                </Badge>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {previewData.order.customer && (
                                <div className="text-xs text-muted-foreground">
                                    <strong className="text-foreground">Clover customer:</strong>{" "}
                                    {previewData.order.customer.firstName ?? ""}{" "}
                                    {previewData.order.customer.lastName ?? ""} ·{" "}
                                    {previewData.order.customer.email ?? "no email"} ·{" "}
                                    {previewData.order.customer.phone ?? "no phone"} · ID{" "}
                                    {previewData.order.customer.id}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Order summary */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <Row label="Order ID" value={previewData.order.id} />
                            <Row label="Merchant ID" value={previewData.order.merchantId} />
                            <Row label="Location" value={previewData.order.locationName ?? "—"} />
                            <Row
                                label="Purchase date"
                                value={new Date(previewData.order.createdTime).toLocaleString()}
                            />
                            <Row label="Currency" value={previewData.order.currency} />
                            <Row
                                label="Total"
                                value={`${(previewData.order.total.cents / 100).toFixed(2)} ${previewData.order.currency}`}
                            />
                            <Row label="Payment status" value={previewData.order.paymentStatus} />
                            {previewData.orderFlag && (
                                <Alert variant="default" className="mt-2 border-accent/40">
                                    <TriangleAlert className="h-4 w-4 text-accent" />
                                    <AlertDescription>{previewData.orderFlag}</AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>

                    {/* Line items */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                                Purchased Items ({previewData.items.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {previewData.items.map((it) => (
                                <div key={it.purchaseReference} className="rounded-md border border-border p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-foreground">{it.lineItem.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                Qty {it.lineItem.quantity} × {(it.lineItem.price.cents / 100).toFixed(2)}{" "}
                                                {previewData.order.currency}
                                                {it.lineItem.category ? ` · ${it.lineItem.category}` : ""}
                                            </div>
                                            {it.lineItem.modifiers.length > 0 && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Modifiers:{" "}
                                                    {it.lineItem.modifiers
                                                        .map((m) => `${m.name} (+${(m.amount.cents / 100).toFixed(2)})`)
                                                        .join(", ")}
                                                </div>
                                            )}
                                            {it.lineItem.discountAmount.cents > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    Discount: −{(it.lineItem.discountAmount.cents / 100).toFixed(2)}
                                                </div>
                                            )}
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                Ref: <code>{it.purchaseReference}</code>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge variant={it.eligible ? "default" : "secondary"}>
                                                {it.eligible ? "Eligible" : "Held"}
                                            </Badge>
                                            {it.flag && (
                                                <span className="max-w-[180px] text-right text-[11px] text-muted-foreground">
                                                    {it.flag}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Sync action */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Sync to CRM</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                This will create or reuse the CRM contact and write one purchase record per eligible
                                line item. Repeated syncs are idempotent — no duplicates.
                            </p>
                            <Button
                                onClick={onSync}
                                disabled={syncLoading || !previewData.orderEligible}
                                size="lg"
                            >
                                {syncLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Zap className="mr-2 h-4 w-4" />
                                )}
                                Sync to CRM
                            </Button>
                            {!previewData.orderEligible && (
                                <p className="text-xs text-muted-foreground">
                                    Sync is disabled for this order: {previewData.orderFlag}
                                </p>
                            )}

                            {syncResult && <SyncResultView result={syncResult} />}
                        </CardContent>
                    </Card>
                </div>
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
        <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
                {status.connected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{status.detail}</p>
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
        <div className="rounded-md border border-border bg-card p-3">
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
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
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
            {!status.connected && (
                <div className="mt-2 space-y-1">
                    <p className="text-xs text-destructive">{status.detail}</p>
                    <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                        <strong>How to get the correct Sandbox API Token:</strong>
                        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                            <li>
                                Log in to Clover Sandbox Merchant portal (
                                <code>https://sandbox.dev.clover.com</code>).
                            </li>
                            <li>
                                Switch to test merchant <strong>{status.merchantId}</strong>.
                            </li>
                            <li>
                                Go to <strong>Account &amp; Setup &gt; API Tokens</strong> (under Business
                                Operations).
                            </li>
                            <li>
                                Click <em>Create New Token</em>, give it a name, check <strong>Read</strong> on
                                Merchant, Orders, Customers, Inventory, Payments.
                            </li>
                            <li>
                                Save and copy the generated token into the <code>CLOVER_ACCESS_TOKEN</code> secret.
                            </li>
                        </ol>
                        <p className="mt-1 text-[10px] opacity-80">
                            Note: An App &ldquo;API Key&rdquo; from the Developer portal is not the merchant
                            Bearer access token.
                        </p>
                    </div>
                </div>
            )}
            <DiagnosticPayload d={status.diagnostic} />
        </div>
    );
}

function GhlConnectionCard({ status }: { status: GhlConnectionDetail }) {
    return (
        <div className="rounded-md border border-border bg-card p-3">
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
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                <div>Location ID: {status.locationId}</div>
                <div>HTTP: {status.httpStatus ?? "—"}</div>
                {status.errorCode && <div className="text-destructive">Code: {status.errorCode}</div>}
            </div>
            {!status.connected && <p className="mt-1.5 text-xs text-destructive">{status.detail}</p>}
            {status.connected && <p className="mt-1.5 text-xs text-muted-foreground">{status.detail}</p>}
            <DiagnosticPayload d={status.diagnostic} />
        </div>
    );
}

function MatchBadge({ decision, reason }: { decision: string; reason: string }) {
    const map: Record<
        string,
        {
            icon: React.ReactNode;
            variant: "default" | "secondary" | "destructive" | "outline";
            label: string;
        }
    > = {
        matched_existing: {
            icon: <UserCheck className="h-4 w-4" />,
            variant: "default",
            label: "Match existing contact",
        },
        will_create: {
            icon: <UserPlus className="h-4 w-4" />,
            variant: "secondary",
            label: "Create new contact",
        },
        held_for_review: {
            icon: <HelpCircle className="h-4 w-4" />,
            variant: "destructive",
            label: "Held for review",
        },
        anonymous: {
            icon: <UserX className="h-4 w-4" />,
            variant: "outline",
            label: "Anonymous purchase",
        },
    };
    const cfg = map[decision] ?? map.held_for_review;
    return (
        <div className="flex items-start gap-3">
            <Badge variant={cfg.variant} className="gap-1.5">
                {cfg.icon}
                {cfg.label}
            </Badge>
            <span className="text-sm text-muted-foreground">{reason}</span>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium text-foreground">{value}</span>
        </div>
    );
}

function SyncResultView({ result }: { result: SyncResult }) {
    // Distinguish outcomes visually: success vs needs-attention vs failure.
    const isError = result.outcome === "error";
    const isAttention =
        result.outcome === "held_for_review" ||
        result.outcome === "partial" ||
        result.outcome === "skipped" ||
        (!!result.reviewReason && !isError);
    const variant = isError ? "destructive" : isAttention ? "default" : "default";
    return (
        <Alert variant={variant} className={isAttention ? "border-accent/50" : ""}>
            {isError ? (
                <XCircle className="h-4 w-4 text-destructive" />
            ) : isAttention ? (
                <TriangleAlert className="h-4 w-4 text-accent" />
            ) : (
                <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <AlertTitle className="capitalize">
                {result.outcome === "synced"
                    ? "Synced"
                    : result.outcome === "partial"
                        ? "Partial success"
                        : result.outcome === "held_for_review"
                            ? "Requires review"
                            : result.outcome === "skipped"
                                ? "Skipped"
                                : result.outcome.replace("_", " ")}
            </AlertTitle>
            <AlertDescription className="space-y-2">
                <p>{result.message}</p>
                {result.ghlContactId && (
                    <p className="text-xs">
                        CRM contact: <code>{result.ghlContactId}</code> (matched by {result.matchedBy})
                    </p>
                )}
                {result.purchaseRecordIds.length > 0 && (
                    <p className="text-xs">
                        Purchase records ({result.purchaseRecordIds.length}):{" "}
                        {result.purchaseRecordIds.map((id) => (
                            <code key={id} className="mr-1">
                                {id}
                            </code>
                        ))}
                    </p>
                )}
                {result.reviewReason && (
                    <p className="text-xs">
                        <strong>Review:</strong> {result.reviewReason}
                    </p>
                )}
                {result.error && (
                    <p className="text-xs">
                        <strong>Error:</strong> {result.error}
                    </p>
                )}
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">
                    {result.itemsSynced} synced · {result.itemsHeld} held. You can retry safely — existing
                    records are reused, never duplicated.
                </p>
            </AlertDescription>
        </Alert>
    );
}
