import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerPurchasesListFn } from "@/lib/integration/integration.functions";
import type { CustomerPurchaseRow } from "@/lib/integration/pos-data.server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Search,
  RefreshCw,
  Users,
  CheckCircle2,
  DollarSign,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";

function MatchBadge({ status }: { status: string }) {
  if (status === "MATCHED") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
      >
        CRM Matched
      </Badge>
    );
  }
  if (status === "AUTO_CREATED") {
    return (
      <Badge
        variant="outline"
        className="border-blue-800/40 bg-blue-950/40 text-blue-400 text-[10px]"
      >
        Auto Created
      </Badge>
    );
  }
  if (status === "NO_GHL_MATCH") {
    return (
      <Badge
        variant="outline"
        className="border-amber-800/40 bg-amber-950/40 text-amber-400 text-[10px]"
      >
        No CRM Match
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400 text-[10px]">
      {status}
    </Badge>
  );
}

function ItemChips({ items }: { items: CustomerPurchaseRow["itemsPurchased"] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 4);
  const more = items.length - 4;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {shown.map((item) => (
        <span
          key={item.name}
          title={`${item.name} × ${item.qty}`}
          className="inline-flex items-center gap-1 rounded-md bg-[#18181B] px-2 py-0.5 text-[11px] text-[#E4E4E7] border border-[#27272A] truncate max-w-[140px]"
        >
          <span className="truncate">{item.name}</span>
          {item.qty > 1 && <span className="font-mono text-[10px] text-zinc-400">×{item.qty}</span>}
        </span>
      ))}
      {!expanded && more > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-md bg-[#141417] border border-[#27272A] px-1.5 py-0.5 text-[10px] text-[#A1A1AA] hover:text-white transition-colors"
        >
          +{more} more
        </button>
      )}
      {items.length === 0 && (
        <span className="text-[11px] text-[#52525B] italic">No items recorded</span>
      )}
    </div>
  );
}

export function CustomerPurchasesPage() {
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CustomerPurchaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFn = useServerFn(getCustomerPurchasesListFn);
  const LIMIT = 50;

  const load = useCallback(
    async (q: string, p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFn({
          data: { search: q || undefined, limit: LIMIT, offset: p * LIMIT },
        });
        if (res && "setupRequired" in res && res.setupRequired) {
          setError("Integration not configured. Please complete setup in Settings.");
          return;
        }
        const r = res as { rows: CustomerPurchaseRow[]; total: number };
        setRows(r.rows ?? []);
        setTotal(r.total ?? 0);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load customer purchases.");
      } finally {
        setLoading(false);
      }
    },
    [fetchFn],
  );

  useEffect(() => {
    load("", 0);
  }, [load]);

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(0);
    setProductFilter("all");
    load(q, 0);
  };

  const handlePage = (p: number) => {
    setPage(p);
    load(search, p);
  };

  const allProducts = Array.from(
    new Set(rows.flatMap((r) => r.itemsPurchased.map((i) => i.name))),
  ).sort();

  const filtered =
    productFilter === "all"
      ? rows
      : rows.filter((r) => r.itemsPurchased.some((i) => i.name === productFilter));

  const totalPages = Math.ceil(total / LIMIT);
  const matched = rows.filter(
    (r) => r.matchStatus === "MATCHED" || r.matchStatus === "AUTO_CREATED",
  ).length;
  const totalSpend = rows.reduce((s, r) => s + r.totalSpendCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Purchases"
        description="Comprehensive registry linking Clover customers with purchased menu items and CRM synchronization status."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(search, page)}
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

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Total Customers</span>
              <Users className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {loading ? <Skeleton className="h-8 w-24 bg-zinc-800" /> : total.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">In scope</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>CRM Linked</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
              {loading ? (
                <Skeleton className="h-8 w-20 bg-zinc-800" />
              ) : (
                `${matched} / ${rows.length}`
              )}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Mapped to GoHighLevel</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Unmatched</span>
              <Users className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
              {loading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : rows.length - matched}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Pending identifier matching</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Total Spend</span>
              <DollarSign className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {loading ? <Skeleton className="h-8 w-28 bg-zinc-800" /> : money(totalSpend)}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Current dataset total</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-[#222226] bg-[#111113] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-sm font-semibold text-white font-display">
              Guest Item History ({filtered.length})
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                <Input
                  placeholder="Search by name, email, phone…"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="h-8 w-56 pl-8 border-[#27272A] bg-[#141417] text-xs text-white"
                />
              </div>

              {allProducts.length > 0 && (
                <Select value={productFilter} onValueChange={(v) => setProductFilter(v)}>
                  <SelectTrigger className="h-8 w-[160px] border-[#27272A] bg-[#141417] text-xs text-white">
                    <SelectValue placeholder="Filter Product" />
                  </SelectTrigger>
                  <SelectContent className="border-[#27272A] bg-[#141417] text-white">
                    <SelectItem value="all">All Products</SelectItem>
                    {allProducts.slice(0, 20).map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={7} columns={7} />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                title="No records found"
                description="Try adjusting your product filter or search term."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                    <th className="py-3 px-4 font-medium">Customer</th>
                    <th className="py-3 px-4 font-medium">Items Purchased</th>
                    <th className="py-3 px-4 font-medium">CRM Status</th>
                    <th className="py-3 px-4 text-right font-medium">Total Spend</th>
                    <th className="py-3 px-4 text-right font-medium">Last Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1E]">
                  {filtered.map((row) => {
                    const initials = row.customerName
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase();
                    return (
                      <tr
                        key={row.cloverCustomerId}
                        className="hover:bg-[#161619] transition-colors"
                      >
                        <td className="py-3 px-4 align-top">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-[#1F1F24] border border-[#27272A] flex items-center justify-center text-xs font-bold text-white shrink-0">
                              {initials || "?"}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{row.customerName}</div>
                              {row.email && (
                                <div className="text-[11px] text-[#A1A1AA]">{row.email}</div>
                              )}
                              {row.phone && (
                                <div className="text-[10px] text-[#71717A]">{row.phone}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <ItemChips items={row.itemsPurchased} />
                        </td>
                        <td className="py-3 px-4 align-top">
                          <MatchBadge status={row.matchStatus} />
                          {row.matchMethod && (
                            <div className="text-[10px] text-[#71717A] mt-1">
                              via {row.matchMethod.replace("_", " ")}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top text-right font-mono">
                          <div className="font-bold text-white">{money(row.totalSpendCents)}</div>
                          <div className="text-[10px] text-[#71717A]">{row.orderCount} orders</div>
                        </td>
                        <td className="py-3 px-4 align-top text-right text-[#A1A1AA]">
                          {row.lastVisitMs ? relativeTime(row.lastVisitMs) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[#1E1E22] px-4 py-3 bg-[#0E0E10]">
              <span className="text-xs text-[#71717A]">
                Page {page + 1} of {totalPages} · {total} guests
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => handlePage(page - 1)}
                  className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => handlePage(page + 1)}
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
