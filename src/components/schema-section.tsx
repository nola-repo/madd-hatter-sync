import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, TriangleAlert } from "lucide-react";

export function SchemaSection({ schema, locationId }: { schema: any; locationId?: string }) {
    if (!schema) return null;

    return (
        <div className="space-y-2 text-sm">
            {schema.schema ? (
                <>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>
                            Found schema <strong>{schema.schema.name}</strong> (id:{" "}
                            <code className="text-xs">{schema.schema.id}</code>)
                        </span>
                    </div>
                    {schema.missingFields.length > 0 ? (
                        <Alert variant="destructive" className="mt-2">
                            <TriangleAlert className="h-4 w-4" />
                            <AlertTitle>Missing fields</AlertTitle>
                            <AlertDescription>
                                Create these fields on the custom object in CRM: {schema.missingFields.join(", ")}.
                                Sync is blocked until they exist.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span>All expected fields present ({schema.fields.length} detected).</span>
                        </div>
                    )}
                </>
            ) : (
                <Alert variant="destructive">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertTitle>Custom object schema needs scope or refresh</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>
                            No custom object named “POS Purchase Item” could be discovered via the API for
                            location <code>{locationId}</code>.
                        </p>
                        <div className="space-y-1 text-xs">
                            <p>
                                1. <strong>Custom Object ID:</strong> Detected Custom Object ID{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">6aad9f812c282b1dfcb1c1b8</code> (POS
                                Purchase Items).
                            </p>
                            <p>
                                2. <strong>Association:</strong> Verified association between{" "}
                                <strong>POS Purchase Item</strong> (many) and <strong>Contacts</strong> (Customer).
                            </p>
                            <p>
                                3. <strong>Permissions / Refresh:</strong> After republishing or updating PIT
                                scopes, click the <strong>Refresh</strong> button above to rediscover the schema.
                            </p>
                        </div>

                        {schema.debug?.probed && (
                            <div className="mt-3 rounded border border-destructive/30 bg-background/60 p-2 text-xs">
                                <div className="mb-1 font-semibold text-foreground">
                                    Live API Response Payloads (Diagnostic Inspection):
                                </div>
                                <div className="max-h-60 space-y-2 overflow-y-auto">
                                    {schema.debug.probed.map((item: any, idx: number) => (
                                        <div key={idx} className="rounded bg-muted/50 p-2 font-mono text-[11px]">
                                            <div className="flex items-center justify-between text-muted-foreground">
                                                <span className="font-semibold text-foreground">{item.endpoint}</span>
                                                <span className={item.status === 200 ? "text-primary" : "text-destructive"}>
                                                    Status: {item.status ?? "Error"}
                                                </span>
                                            </div>
                                            {item.error && (
                                                <div className="mt-1 text-destructive">Error: {item.error}</div>
                                            )}
                                            {item.bodySample && (
                                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-card p-1 text-[10px] text-foreground">
                                                    {item.bodySample}
                                                </pre>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
