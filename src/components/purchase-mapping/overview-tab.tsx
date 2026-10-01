// Overview tab: mapping stats + customer mapping table.
import { AlertTriangle, CheckCircle2, Tag, Users, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { StatCard, STATUS_COLORS, SYNC_COLORS, crmContactUrl } from "./shared";

export type MappingStats = {
  totalCloverCustomers: number;
  customersWithPurchases: number;
  matchedGhlContacts: number;
  verifiedMappings: number;
  unmatchedCustomers: number;
  needsReview: number;
  conflicts: number;
  tagsApplied: number;
  tagsVerified: number;
  tagsFailed: number;
  outOfSync: number;
  skippedNoIdentifiers?: number;
};

export type MappingTableRow = {
  customerName: string;
  email: string | null;
  phone: string | null;
  purchaseCount: number;
  ghlContactId: string | null;
  matchMethod: string | null;
  matchStatus: string;
  tagCount: number;
  syncStatus: string;
};

export function MappingOverviewTab({
  stats,
  tableRows,
  skippedNoIdentifiers,
  loading,
}: {
  stats: MappingStats | null;
  tableRows: MappingTableRow[];
  skippedNoIdentifiers: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        Loading mapping monitor…
      </div>
    );
  }

  if (!stats) {
    return (
      <EmptyState
        title="No monitor data"
        description="Run 'Sync Clover Data' in Settings to populate mapping data."
      />
    );
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clover Customers"
          value={stats.totalCloverCustomers}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="With Purchases"
          value={stats.customersWithPurchases}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Matched CRM"
          value={stats.matchedGhlContacts}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Verified Mappings"
          value={stats.verifiedMappings}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Unmatched"
          value={stats.unmatchedCustomers}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Needs Review"
          value={stats.needsReview}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Conflicts"
          value={stats.conflicts}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Tags Applied"
          value={stats.tagsApplied}
          icon={<Tag className="h-4 w-4" />}
        />
        <StatCard
          label="Tags Verified"
          value={stats.tagsVerified}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Tags Failed"
          value={stats.tagsFailed}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Out of Sync"
          value={stats.outOfSync}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Skipped (No Identifiers)"
          value={stats.skippedNoIdentifiers ?? skippedNoIdentifiers}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Customer Mapping Table ({tableRows.length})
            {skippedNoIdentifiers > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {skippedNoIdentifiers} customers skipped (no identifiers)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <EmptyState
              title="No customers mapped yet"
              description="Run 'Sync Clover Data' in Settings to process purchases and match CRM contacts."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Customer</th>
                    <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                    <th className="pb-2 pr-4 font-medium">Purchases</th>
                    <th className="pb-2 pr-4 font-medium">CRM Contact</th>
                    <th className="pb-2 pr-4 font-medium">Match Method</th>
                    <th className="pb-2 pr-4 font-medium">Match Status</th>
                    <th className="pb-2 pr-4 font-medium">Tags</th>
                    <th className="pb-2 font-medium">Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((c, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium text-foreground">{c.customerName}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {c.email || c.phone || "—"}
                      </td>
                      <td className="py-2.5 pr-4">{c.purchaseCount}</td>
                      <td className="py-2.5 pr-4">
                        {c.ghlContactId ? (
                          <a
                            href={crmContactUrl(c.ghlContactId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            {c.ghlContactId.slice(0, 8)}…
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {c.matchMethod ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={(STATUS_COLORS[c.matchStatus] as any) ?? "outline"}
                          className="text-[10px]"
                        >
                          {c.matchStatus}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">{c.tagCount}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={(SYNC_COLORS[c.syncStatus] as any) ?? "outline"}
                          className="text-[10px]"
                        >
                          {c.syncStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
