import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SchemaSection } from "@/components/schema-section";
import { SyncControl } from "@/components/sync-control";
import { ProviderConnectedCard } from "@/components/provider-connected-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getSchemaStatus } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";

type SchemaResult = {
  setupRequired?: boolean;
  ok?: boolean;
  schema?: { id: string; name: string; key: string } | null;
  fields?: unknown[];
  missingFields?: string[];
  fieldKeyMap?: unknown;
  debug?: { probed?: unknown[] } | null;
};

export function SettingsPage() {
  const getSchemaFn = useServerFn(getSchemaStatus);

  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState<string[] | null>(null);

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const res = await getSchemaFn();
      if (res?.setupRequired) {
        setSetupRequired((res as { missing?: string[] }).missing ?? []);
      } else {
        setSchema(res as SchemaResult);
      }
    } catch (e: unknown) {
      setSetupRequired([e instanceof Error ? e.message : "Failed to load schema"]);
    } finally {
      setSchemaLoading(false);
    }
  }, [getSchemaFn]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

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
          <Button variant="outline" size="sm" onClick={loadSchema} disabled={schemaLoading}>
            {schemaLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      <ProviderConnectedCard />

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
            <SchemaSection schema={schema} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
