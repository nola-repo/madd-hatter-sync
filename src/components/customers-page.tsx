import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Search,
  Users,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Tag,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCustomerDetailsList,
  getCustomerHistory,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncVersion, useSyncContext } from "@/hooks/use-sync-context";
import { money, formatDateTime, relativeTime } from "@/lib/integration/format";
import type { CustomerDetailRow } from "@/lib/integration/types";

const PAGE_SIZE = 25;
const CRM_LOCATION_ID = "7biYjalPZzmmvKaLw0WN";

function crmContactUrl(contactId: string) {
  return `https://app.gohighlevel.com/sub-account/${CRM_LOCATION_ID}/contacts/${contactId}`;
}

export function CustomersPage() {
  const listFn = useServerFn(getCustomerDetailsList);
  const historyFn = useServerFn(getCustomerHistory);
  const syncVersion = useSyncVersion();
  const { bump } = useSyncContext();

  const [rows, setRows] = useState<CustomerDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  // Selected customer for profile sheet
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetailRow | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({
        data: {
          search: search || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (res?.setupRequired) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      console.error("Failed to load customer directory:", e);
    } finally {
      setLoading(false);
    }
  }, [listFn, search, page]);

  useEffect(() => {
    load();
  }, [load, syncVersion]);

  const handleSelectCustomer = async (cust: CustomerDetailRow) => {
    setSelectedCustomer(cust);
    setHistoryLoading(true);
    try {
      const res = await historyFn({ data: { cloverCustomerId: cust.cloverCustomerId } });
      if (!res.setupRequired) {
        setCustomerHistory(res.history);
      }
    } catch (e) {
      console.error("Error loading customer history:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredRows = rows.filter((r) => {
    if (matchFilter === "all") return true;
    if (matchFilter === "matched") return !!r.ghlContactId;
    if (matchFilter === "unmatched") return !r.ghlContactId;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const matchedCount = rows.filter((r) => !!r.ghlContactId).length;
  const totalSpendCurrent = rows.reduce((s, r) => s + (r.totalSpendCents || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Intelligence"
        description="Verified guest directory with lifetime hospitality metrics and CRM contact synchronizations."
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
            Refresh Directory
          </Button>
        }
      />

      {/* Metric Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Tracked Guests</span>
              <Users className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {loading ? <Skeleton className="h-8 w-24 bg-zinc-800" /> : total.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Unique Clover customer profiles</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>CRM Matched Contacts</span>
              <UserCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
              {loading ? (
                <Skeleton className="h-8 w-20 bg-zinc-800" />
              ) : (
                `${matchedCount} / ${rows.length}`
              )}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Mapped to GoHighLevel</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Current View Spend</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {loading ? <Skeleton className="h-8 w-28 bg-zinc-800" /> : money(totalSpendCurrent)}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Total lifetime spend in view</div>
          </CardContent>
        </Card>

        <Card className="border-[#222226] bg-[#111113]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Match Accuracy</span>
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-blue-400">
              {loading ? (
                <Skeleton className="h-8 w-16 bg-zinc-800" />
              ) : rows.length > 0 ? (
                `${Math.round((matchedCount / rows.length) * 100)}%`
              ) : (
                "0%"
              )}
            </div>
            <div className="mt-1 text-[11px] text-[#71717A]">Email & phone waterfall</div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Directory Table */}
      <Card className="border-[#222226] bg-[#111113] shadow-lg">
        <CardHeader className="pb-3 border-b border-[#1E1E22]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-white font-display">
                Customer Registry
              </CardTitle>
              <Badge
                variant="outline"
                className="text-[10px] font-mono border-zinc-700 bg-zinc-900/60"
              >
                {total} Total
              </Badge>
            </div>

            {/* Search & Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                <Input
                  placeholder="Search by name, email, phone, ID…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="h-8 w-56 sm:w-64 pl-8 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B]"
                />
              </div>

              <Select value={matchFilter} onValueChange={(v) => setMatchFilter(v)}>
                <SelectTrigger className="h-8 w-[140px] border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7]">
                  <SelectValue placeholder="CRM Status" />
                </SelectTrigger>
                <SelectContent className="border-[#27272A] bg-[#141417] text-[#E4E4E7]">
                  <SelectItem value="all">All Guests</SelectItem>
                  <SelectItem value="matched">CRM Matched</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={7} columns={8} />
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                title="No customers found"
                description="Try adjusting your search criteria."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E1E22] bg-[#0E0E10] text-[#71717A]">
                    <th className="py-3 px-4 font-medium">Guest Name & ID</th>
                    <th className="py-3 px-4 font-medium">Contact Details</th>
                    <th className="py-3 px-4 font-medium">CRM Match</th>
                    <th className="py-3 px-4 font-medium">Orders</th>
                    <th className="py-3 px-4 font-medium">Lifetime Spend</th>
                    <th className="py-3 px-4 font-medium">Avg Check</th>
                    <th className="py-3 px-4 font-medium">Last Visit</th>
                    <th className="py-3 px-4 text-right font-medium">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1E]">
                  {filteredRows.map((c) => {
                    const fullName =
                      [c.firstName, c.lastName].filter(Boolean).join(" ") || c.cloverCustomerId;
                    return (
                      <tr
                        key={c.cloverCustomerId}
                        onClick={() => handleSelectCustomer(c)}
                        className="hover:bg-[#161619] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white group-hover:text-zinc-200 transition-colors">
                            {fullName}
                          </div>
                          <div className="font-mono text-[10px] text-[#71717A]">
                            {c.cloverCustomerId}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#A1A1AA]">
                          {c.email && (
                            <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                              <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
                              <span className="truncate">{c.email}</span>
                            </div>
                          )}
                          {c.phone && (
                            <div className="flex items-center gap-1.5 text-[11px] text-[#71717A] mt-0.5">
                              <Phone className="h-2.5 w-2.5 text-zinc-500 shrink-0" />
                              <span>{c.phone}</span>
                            </div>
                          )}
                          {!c.email && !c.phone && (
                            <span className="text-[#52525B]">No contact on file</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {c.ghlContactId ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                            >
                              {c.matchedBy ?? "Matched"}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-zinc-800 bg-zinc-900 text-zinc-500 text-[10px]"
                            >
                              Unmatched
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-white">
                          {c.orderCount}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {money(c.totalSpendCents)}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#A1A1AA]">
                          {money(c.averageOrderCents)}
                        </td>
                        <td className="py-3 px-4 text-[#71717A]">
                          <span title={formatDateTime(c.lastVisitMs)}>
                            {relativeTime(c.lastVisitMs)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] text-[#A1A1AA] hover:text-white hover:bg-zinc-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectCustomer(c);
                            }}
                          >
                            Intelligence
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[#1E1E22] px-4 py-3 bg-[#0E0E10]">
            <span className="text-xs text-[#71717A]">
              Showing {filteredRows.length} of {total} guests · Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7] hover:bg-[#1E1E24]"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#E4E4E7] hover:bg-[#1E1E24]"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Intelligence Profile Sheet */}
      <Sheet
        open={!!selectedCustomer}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCustomer(null);
            setCustomerHistory(null);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-xl bg-[#0E0E11] border-[#222226] text-[#F5F5F5] p-6 overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-[#222226]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300 font-semibold">
                Guest Intelligence
              </span>
              <span className="text-xs text-[#71717A]">·</span>
              <span className="font-mono text-xs text-[#A1A1AA]">
                {selectedCustomer?.cloverCustomerId}
              </span>
            </div>
            <SheetTitle className="text-xl font-bold font-display text-white">
              {[selectedCustomer?.firstName, selectedCustomer?.lastName]
                .filter(Boolean)
                .join(" ") || selectedCustomer?.cloverCustomerId}
            </SheetTitle>
            <SheetDescription className="text-xs text-[#71717A]">
              Historical hospitality activity, lifetime spending, and verified CRM sync records.
            </SheetDescription>
          </SheetHeader>

          {historyLoading ? (
            <div className="py-16 text-center text-xs text-[#A1A1AA]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
              Aggregating guest purchase history…
            </div>
          ) : selectedCustomer ? (
            <div className="mt-6 space-y-6">
              {/* KPI Metrics */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#141417] border border-[#222226]">
                <div>
                  <div className="text-[10px] text-[#71717A] uppercase">Lifetime Spend</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {money(selectedCustomer.totalSpendCents)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717A] uppercase">Orders / Visits</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {selectedCustomer.orderCount}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717A] uppercase">Avg Order Size</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {money(selectedCustomer.averageOrderCents)}
                  </div>
                </div>
              </div>

              {/* Contact & CRM Mapping Card */}
              <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 space-y-3">
                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-display">
                  Identity & CRM Mapping
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#71717A]">Email Address:</span>
                    <div className="text-[#D4D4D8] font-mono mt-0.5 truncate">
                      {selectedCustomer.email ?? "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Phone Number:</span>
                    <div className="text-[#D4D4D8] font-mono mt-0.5">
                      {selectedCustomer.phone ?? "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A]">GHL Contact ID:</span>
                    <div className="font-mono mt-0.5">
                      {selectedCustomer.ghlContactId ? (
                        <a
                          href={crmContactUrl(selectedCustomer.ghlContactId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          {selectedCustomer.ghlContactId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-[#71717A]">Unmatched</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Matching Method:</span>
                    <div className="text-[#D4D4D8] mt-0.5">
                      {selectedCustomer.matchedBy ? (
                        <Badge variant="outline" className="text-[10px] border-zinc-700">
                          {selectedCustomer.matchedBy}
                        </Badge>
                      ) : (
                        <span className="text-[#71717A]">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Purchase History / Past Orders */}
              <div>
                <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2 font-display flex items-center justify-between">
                  <span>Recent Purchases</span>
                  {customerHistory?.orders && (
                    <span className="text-[#71717A] text-[11px] font-normal">
                      {customerHistory.orders.length} transactions
                    </span>
                  )}
                </div>
                {customerHistory?.orders && customerHistory.orders.length > 0 ? (
                  <div className="rounded-xl border border-[#222226] divide-y divide-[#1E1E22] bg-[#141417] overflow-hidden">
                    {customerHistory.orders.slice(0, 8).map((ord: any) => (
                      <div key={ord.id} className="p-3 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-mono font-medium text-white">
                            {ord.clover_order_id}
                          </div>
                          <div className="text-[10px] text-[#71717A]">
                            {formatDateTime(ord.created_time)} · {ord.payment_status}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-semibold text-white">
                            {money(ord.total_cents)}
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[9px] border-zinc-800 text-zinc-400"
                          >
                            {ord.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#222226] bg-[#141417] p-4 text-center text-xs text-[#71717A]">
                    No individual order items recorded for this profile yet.
                  </div>
                )}
              </div>

              {/* Most Frequently Purchased Items */}
              {customerHistory?.items && customerHistory.items.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2 font-display">
                    Favorite Items & Preferences
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {customerHistory.items.slice(0, 10).map((it: any) => (
                      <span
                        key={it.name}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#1F1F24] px-2.5 py-1 text-xs text-[#E4E4E7] border border-[#2A2A30]"
                      >
                        <ShoppingBag className="h-3 w-3 text-zinc-400" />
                        <span>{it.name}</span>
                        <span className="font-mono text-[10px] text-[#71717A]">×{it.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
