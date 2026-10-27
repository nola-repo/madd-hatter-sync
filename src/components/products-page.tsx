import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Package, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { getProductsList } from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money } from "@/lib/integration/format";
import type { ProductListItem } from "@/lib/integration/types";

const PAGE_SIZE = 25;

export function ProductsPage() {
  const listFn = useServerFn(getProductsList);
  const syncVersion = useSyncVersion();
  const { bump } = useSyncContext();

  const [rows, setRows] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({
        data: { search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      });
      if (res?.setupRequired) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [listFn, search, page]);

  useEffect(() => {
    load();
  }, [load, syncVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Sales Velocity"
        description="Aggregated item sales, order frequency, and revenue distribution from Clover POS order items."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              bump();
              load();
            }}
            disabled={loading}
            className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      <Card className="border-[#222226] bg-[#111113] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-zinc-400" />
              <CardTitle className="text-sm font-semibold text-white font-display">
                Products ({total})
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                <Input
                  placeholder="Search product or category…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="h-8 w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={7} columns={5} />
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                title="No products recorded"
                description="Item sales metrics populate once Clover orders are ingested."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                    <th className="py-3 px-4 font-medium">Product Name</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Base Price</th>
                    <th className="py-3 px-4 font-medium">Quantity Sold</th>
                    <th className="py-3 px-4 font-medium">Revenue</th>
                    <th className="py-3 px-4 text-right font-medium">Orders Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1E]">
                  {rows.map((p) => (
                    <tr key={p.name} className="hover:bg-[#161619] transition-colors">
                      <td className="py-3 px-4 font-medium text-white">{p.name}</td>
                      <td className="py-3 px-4 text-[#A1A1AA]">
                        {p.category ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-zinc-700 bg-zinc-900/60"
                          >
                            {p.category}
                          </Badge>
                        ) : (
                          <span className="text-[#52525B]">Uncategorized</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#D4D4D8]">{money(p.priceCents)}</td>
                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {p.quantitySold.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                        {money(p.revenueCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#A1A1AA]">
                        {p.orderCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#1E1E22] px-4 py-3 bg-[#0E0E10]">
              <span className="text-xs text-[#71717A]">
                Page {page + 1} of {totalPages} · {total} products
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
