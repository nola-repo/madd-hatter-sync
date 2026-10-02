// Purchase Mapping monitor page — thin orchestrator over focused tab modules.
import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import {
  findItemCustomers,
  tagItemCustomers,
  getMappingMonitorFn,
  getMappingTableFn,
  getReviewQueueFn,
  getSyncedContactsFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion } from "@/hooks/use-sync-context";
import type {
  ItemSearchResult,
  PurchaseTagSummary,
} from "@/lib/integration/purchase-mapping.server";
import type { Range } from "./purchase-mapping/shared";
import { MappingOverviewTab } from "./purchase-mapping/overview-tab";
import { SyncedContactsTab } from "./purchase-mapping/synced-tab";
import { ReviewQueueTab } from "./purchase-mapping/review-tab";
import { ItemSearchTab } from "./purchase-mapping/search-tab";

export function PurchaseMappingPage() {
  const findFn = useServerFn(findItemCustomers);
  const tagFn = useServerFn(tagItemCustomers);
  const monitorFn = useServerFn(getMappingMonitorFn);
  const tableFn = useServerFn(getMappingTableFn);
  const reviewFn = useServerFn(getReviewQueueFn);
  const syncedFn = useServerFn(getSyncedContactsFn);
  const syncVersion = useSyncVersion();

  const [search, setSearch] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [result, setResult] = useState<ItemSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tagSummary, setTagSummary] = useState<PurchaseTagSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Monitor state
  const [stats, setStats] = useState<any>(null);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [skippedNoIdentifiers, setSkippedNoIdentifiers] = useState(0);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [syncedRows, setSyncedRows] = useState<any[]>([]);
  const [syncedTotal, setSyncedTotal] = useState(0);
  const [monitorLoading, setMonitorLoading] = useState(true);

  const loadMonitor = useCallback(async () => {
    setMonitorLoading(true);
    try {
      const [s, t, r, sc] = await Promise.all([
        monitorFn(),
        tableFn({ data: { limit: 1000 } }),
        reviewFn({ data: { limit: 50 } }),
        syncedFn({ data: { limit: 1000 } }),
      ]);
      setStats((s as any)?.stats ?? null);
      setTableRows((t as any)?.rows ?? []);
      setSkippedNoIdentifiers((t as any)?.skippedNoIdentifiers ?? 0);
      setReviewRows((r as any)?.rows ?? []);
      setSyncedRows((sc as any)?.contacts ?? []);
      setSyncedTotal((sc as any)?.total ?? 0);
    } catch {
      /* ignore */
    } finally {
      setMonitorLoading(false);
    }
  }, [monitorFn, tableFn, reviewFn, syncedFn]);

  useEffect(() => {
    loadMonitor();
  }, [loadMonitor, syncVersion]);

  const search_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTagSummary(null);
    try {
      // Empty itemName → server returns the 500 most recent purchases (default load)
      const res = await findFn({ data: { itemName: search.trim(), range } });
      if (res?.setupRequired) {
        setError("Setup required: " + res.message);
        return;
      }
      setResult(res as any);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [findFn, search, range]);

  // Auto-load the default set on mount so the Item Search tab isn't blank.
  useEffect(() => {
    search_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTags = useCallback(async () => {
    if (!search.trim()) return;
    setTagging(true);
    setError(null);
    try {
      const res = await tagFn({ data: { itemName: search.trim(), range } });
      if (res?.setupRequired) {
        setError("Setup required: " + res.message);
        return;
      }
      setTagSummary(res as any);
      await search_();
      await loadMonitor();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setTagging(false);
    }
  }, [tagFn, search, range, search_, loadMonitor]);

  return (
    <div>
      <PageHeader
        title="Purchase Mapping"
        description="Monitor Clover → CRM contact matching and purchase tags. Search 'Who bought Wings?' to apply tags."
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="synced">Synced ({syncedTotal})</TabsTrigger>
          <TabsTrigger value="review">Review Queue</TabsTrigger>
          <TabsTrigger value="search">Item Search</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <MappingOverviewTab
            stats={stats}
            tableRows={tableRows}
            skippedNoIdentifiers={skippedNoIdentifiers}
            loading={monitorLoading}
          />
        </TabsContent>

        <TabsContent value="synced">
          <SyncedContactsTab rows={syncedRows} total={syncedTotal} />
        </TabsContent>

        <TabsContent value="review">
          <ReviewQueueTab rows={reviewRows} />
        </TabsContent>

        <TabsContent value="search">
          <ItemSearchTab
            search={search}
            setSearch={setSearch}
            range={range}
            setRange={setRange}
            result={result}
            loading={loading}
            tagging={tagging}
            tagSummary={tagSummary}
            error={error}
            onSearch={search_}
            onApplyTags={applyTags}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
