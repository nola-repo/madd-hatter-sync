// Item Search tab: "Who bought Wings?" diagnostic query + manual tag application.
import { Loader2, Search, Tag, Users, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-header";
import { money, formatDateTime } from "@/lib/integration/format";
import type {
  ItemSearchResult,
  PurchaseTagSummary,
} from "@/lib/integration/purchase-mapping.server";
import { StatCard, SummaryStat, STATUS_COLORS, type Range } from "./shared";

export function ItemSearchTab({
  search,
  setSearch,
  range,
  setRange,
  result,
  loading,
  tagging,
  tagSummary,
  error,
  onSearch,
  onApplyTags,
}: {
  search: string;
  setSearch: (v: string) => void;
  range: Range;
  setRange: (v: Range) => void;
  result: ItemSearchResult | null;
  loading: boolean;
  tagging: boolean;
  tagSummary: PurchaseTagSummary | null;
  error: string | null;
  onSearch: () => void;
  onApplyTags: () => void;
}) {
  return (
    <>
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Find Customers by Item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Item name (e.g. "Wings")
              </label>
              <Input
                placeholder="Enter an item name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                className="h-9"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Date range
              </label>
              <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={onSearch} disabled={loading || !search.trim()} className="h-9">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find Customers
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <>
          {result.itemFound ? (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Customers"
                  value={result.totalCustomers}
                  icon={<Users className="h-4 w-4" />}
                />
                <StatCard
                  label="Total Quantity"
                  value={result.totalQuantity}
                  icon={<Tag className="h-4 w-4" />}
                />
                <StatCard
                  label="Total Revenue"
                  value={money(result.totalRevenueCents)}
                  icon={<Tag className="h-4 w-4" />}
                />
                <StatCard label="Item" value={result.itemName} icon={<Tag className="h-4 w-4" />} />
              </div>

              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">
                      Customers ({result.customers.length})
                    </CardTitle>
                    <Button
                      onClick={onApplyTags}
                      disabled={tagging || result.customers.length === 0}
                      className="h-9"
                    >
                      {tagging ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Tag className="h-4 w-4" />
                      )}
                      Apply "Purchased: {result.itemName}" Tags
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tagSummary && (
                    <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">Tagging result</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <SummaryStat label="Processed" value={tagSummary.processed} />
                        <SummaryStat label="Tags applied" value={tagSummary.tagsApplied} />
                        <SummaryStat label="Already tagged" value={tagSummary.alreadyTagged} />
                        <SummaryStat label="Verified" value={tagSummary.tagsVerified} />
                        <SummaryStat label="Skipped" value={tagSummary.skipped} />
                        <SummaryStat label="Errors" value={tagSummary.errors} />
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Customer</th>
                          <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                          <th className="pb-2 pr-4 font-medium">Qty</th>
                          <th className="pb-2 pr-4 font-medium">Spent</th>
                          <th className="pb-2 pr-4 font-medium">Date</th>
                          <th className="pb-2 pr-4 font-medium">Order</th>
                          <th className="pb-2 pr-4 font-medium">Match</th>
                          <th className="pb-2 font-medium">Tag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.customers.map((c, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2.5 pr-4 font-medium text-foreground">
                              {c.customerName}
                            </td>
                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                              {c.email || c.phone || "—"}
                            </td>
                            <td className="py-2.5 pr-4">{c.quantity}</td>
                            <td className="py-2.5 pr-4 font-medium">{money(c.amountSpentCents)}</td>
                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                              {formatDateTime(c.purchaseDate)}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                              {c.cloverOrderId}
                            </td>
                            <td className="py-2.5 pr-4">
                              <Badge
                                variant={(STATUS_COLORS[c.matchStatus] as any) ?? "outline"}
                                className="text-[10px]"
                              >
                                {c.matchStatus}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={(STATUS_COLORS[c.tagStatus] as any) ?? "outline"}
                                  className="text-[10px]"
                                >
                                  {c.tagStatus}
                                </Badge>
                                {c.ghlContactId && (
                                  <a
                                    href={`https://app.gohighlevel.com/sub-account/7biYjalPZzmmvKaLw0WN/contacts/${c.ghlContactId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    View in CRM
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title="No matching item found"
              description={`No purchased item matched "${search}". Make sure the item name matches a Clover item and that POS data has been synced.`}
            />
          )}
        </>
      )}

      {!result && !loading && !error && (
        <EmptyState
          title="Search for an item to begin"
          description="Enter an item name like “Wings” to find every customer who purchased it, then apply a purchase tag to their CRM contact."
        />
      )}
    </>
  );
}
