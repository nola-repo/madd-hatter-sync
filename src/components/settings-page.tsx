import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SchemaSection } from "@/components/schema-section";
import { SyncControl } from "@/components/sync-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getConnectionStatus, getSchemaStatus } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import type { ConnectionStatus } from "@/lib/integration/types";

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
