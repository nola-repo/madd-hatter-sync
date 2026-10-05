import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { getProviderStatus } from "@/lib/integration/provider-status.functions";
import type { ProviderStatus } from "@/lib/integration/types";
import { cn } from "@/lib/utils";

type CheckState = "checking" | "connected" | "error";

const PROVIDER_LABELS: Record<ProviderStatus["provider"], string> = {
  clover: "Clover",
  ghl: "GoHighLevel",
};

function StatusDot({ state }: { state: CheckState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        state === "connected" && "bg-primary",
        state === "error" && "bg-destructive",
        state === "checking" && "bg-accent animate-pulse",
      )}
    />
  );
}

function statusLabel(state: CheckState): string {
  if (state === "connected") return "Connected";
  if (state === "error") return "Not connected";
  return "Checking…";
}

export function ProviderConnectedCard() {
  const getProviderStatusFn = useServerFn(getProviderStatus);

  const [providers, setProviders] = useState<Record<ProviderStatus["provider"], CheckState>>({
    clover: "checking",
    ghl: "checking",
  });
  const [identifiers, setIdentifiers] = useState<Record<ProviderStatus["provider"], string | null>>(
    {
      clover: null,
      ghl: null,
    },
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    setProviders({ clover: "checking", ghl: "checking" });
    try {
      const res = await getProviderStatusFn();
      if (res?.setupRequired) return;
      const list = (res as { providers?: ProviderStatus[] }).providers ?? [];
      const cloverItem = list.find((p) => p.provider === "clover");
      const ghlItem = list.find((p) => p.provider === "ghl");

      setProviders({
        clover: cloverItem?.status ?? "error",
        ghl: ghlItem?.status ?? "error",
      });
      setIdentifiers({
        clover: cloverItem?.identifier ?? null,
        ghl: ghlItem?.identifier ?? null,
      });
    } catch {
      setProviders({ clover: "error", ghl: "error" });
    } finally {
      setRefreshing(false);
    }
  }, [getProviderStatusFn]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Provider Connected</CardTitle>
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(["clover", "ghl"] as const).map((key) => {
          const idLabel = key === "clover" ? "Merchant ID" : "Location ID";
          const idValue = identifiers[key];

          return (
            <div
              key={key}
              id={`provider-row-${key}`}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-3">
                <StatusDot state={providers[key]} />
                <span className="text-sm font-medium text-foreground">{PROVIDER_LABELS[key]}</span>
              </div>
              <div className="flex items-center justify-between gap-2 sm:ml-auto">
                {idValue && (
                  <span className="inline-flex items-center gap-1.5 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="text-muted-foreground">{idLabel}:</span>
                    <span className="font-mono">{idValue}</span>
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{statusLabel(providers[key])}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
