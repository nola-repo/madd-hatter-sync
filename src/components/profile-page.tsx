import { useCallback, useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { RefreshCw, Loader2 } from "lucide-react";
import { adminMe } from "@/lib/integration/auth.functions";
import { getProviderStatus } from "@/lib/integration/provider-status.functions";
import type { ProviderStatus } from "@/lib/integration/types";
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/_authenticated");

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

export function ProfilePage() {
  const ctx = routeApi.useRouteContext();
  const getProviderStatusFn = useServerFn(getProviderStatus);
  const adminMeFn = useServerFn(adminMe);

  const [email, setEmail] = useState<string | null>(ctx.session?.email ?? null);
  const [providers, setProviders] = useState<Record<ProviderStatus["provider"], CheckState>>({
    clover: "checking",
    ghl: "checking",
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadEmail = useCallback(async () => {
    if (email) return;
    try {
      const res = await adminMeFn();
      if (!res.setupRequired && res.session?.email) setEmail(res.session.email);
    } catch {
      /* ignore */
    }
  }, [adminMeFn, email]);

  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    setProviders({ clover: "checking", ghl: "checking" });
    try {
      const res = await getProviderStatusFn();
      if (res?.setupRequired) return;
      const list = (res as { providers?: ProviderStatus[] }).providers ?? [];
      setProviders({
        clover: list.find((p) => p.provider === "clover")?.status ?? "error",
        ghl: list.find((p) => p.provider === "ghl")?.status ?? "error",
      });
    } catch {
      setProviders({ clover: "error", ghl: "error" });
    } finally {
      setRefreshing(false);
    }
  }, [getProviderStatusFn]);

  useEffect(() => {
    loadEmail();
    loadStatus();
  }, [loadEmail, loadStatus]);

  const initial = (email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your account and provider connections"
        actions={
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{email ?? "Signed in user"}</div>
            <div className="truncate text-xs text-muted-foreground">{email ?? ""}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Provider Connected</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["clover", "ghl"] as const).map((key) => (
            <div
              key={key}
              id={`provider-row-${key}`}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
            >
              <StatusDot state={providers[key]} />
              <span className="text-sm font-medium text-foreground">{PROVIDER_LABELS[key]}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {statusLabel(providers[key])}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
