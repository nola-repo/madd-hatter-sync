// Presentational component that renders the raw live API diagnostic captured
// by the server-side connection checks (Clover / CRM). No secrets are ever
// shown — only non-secret indicators (token length, merchant id) and the
// sanitized/truncated response body.
import type { ConnectionDiagnostic } from "@/lib/integration/types";

export function DiagnosticPayload({ d }: { d: ConnectionDiagnostic | null }) {
    if (!d) return null;
    return (
        <div className="mt-2 rounded border border-border/60 bg-muted/40 p-2 text-[11px]">
            <div className="mb-1 font-semibold text-foreground">Live API Response (Diagnostic):</div>
            <div className="space-y-0.5 font-mono text-muted-foreground">
                <div>
                    <span className="text-foreground">Method:</span> {d.method}
                </div>
                <div className="break-all">
                    <span className="text-foreground">Base URL:</span> {d.baseUrl}
                </div>
                <div className="break-all">
                    <span className="text-foreground">Endpoint:</span> {d.endpoint}
                </div>
                <div>
                    <span className="text-foreground">Auth mode:</span> {d.authMode}
                </div>
                <div>
                    <span className="text-foreground">HTTP status:</span>{" "}
                    <span className={d.httpStatus === 200 ? "text-primary" : "text-destructive"}>
                        {d.httpStatus ?? "—"}
                    </span>
                </div>
                {typeof d.tokenLoaded !== "undefined" && (
                    <div>
                        <span className="text-foreground">Token loaded:</span>{" "}
                        <span className={d.tokenLoaded ? "text-primary" : "text-destructive"}>
                            {d.tokenLoaded ? "yes" : "no — CLOVER_ACCESS_TOKEN is empty/missing"}
                        </span>
                    </div>
                )}
                {typeof d.tokenLength === "number" && (
                    <div>
                        <span className="text-foreground">Token length:</span> {d.tokenLength} chars
                        {d.tokenLength > 0 && d.tokenLength < 20 && (
                            <span className="text-destructive"> — too short, likely truncated</span>
                        )}
                    </div>
                )}
                {typeof d.merchantId !== "undefined" && (
                    <div className="break-all">
                        <span className="text-foreground">Merchant ID:</span> {d.merchantId}
                    </div>
                )}
                {d.alternateAttempt && (
                    <div className="mt-1 border-t border-border/40 pt-1">
                        <div className="font-semibold text-foreground">
                            Also tried: {d.alternateAttempt.authMode}
                        </div>
                        <div>
                            HTTP status:{" "}
                            <span
                                className={d.alternateAttempt.status === 200 ? "text-primary" : "text-destructive"}
                            >
                                {d.alternateAttempt.status}
                            </span>
                        </div>
                        <div className="break-all text-muted-foreground">
                            {d.alternateAttempt.body || "(empty body)"}
                        </div>
                    </div>
                )}
            </div>
            <div className="mt-1 font-semibold text-foreground">Response body:</div>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-card p-1.5 text-[10px] text-foreground">
                {d.responseBody || "(empty body)"}
            </pre>
        </div>
    );
}
