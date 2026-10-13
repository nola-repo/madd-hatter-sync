import { useCallback, useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, Download, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { usePagination, Pager } from "@/components/purchase-mapping/pagination";
import { useServerFn } from "@tanstack/react-start";
import { searchCustomerPurchasesByItemFn } from "@/lib/integration/product-functions";
import { money } from "@/lib/integration/format";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import type { CustomerPurchaseSearchResult } from "@/lib/integration/product-mapping.server";

type ViewMode = "purchases" | "customers";

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function presetRange(preset: string): { startDate: string; endDate: string } | null {
  if (preset === "all") return null;
  const now = new Date();
  const tz = "America/New_York";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  if (preset === "today") {
    return { startDate: fmt(now), endDate: fmt(now) };
  }
  if (preset === "yesterday") {
    const y = new Date(now.getTime() - 86400000);
    return { startDate: fmt(y), endDate: fmt(y) };
  }
  if (preset === "week") {
    const day = now.getDay();
    const start = new Date(now.getTime() - day * 86400000);
    return { startDate: fmt(start), endDate: fmt(now) };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: fmt(start), endDate: fmt(now) };
  }
  if (preset === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { startDate: fmt(start), endDate: fmt(now) };
  }
  return null;
}

export function ProductBuyerSearchPage() {
  const searchFn = useServerFn(searchCustomerPurchasesByItemFn);
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [view, setView] = useState<ViewMode>("customers");
  const [result, setResult] = useState<CustomerPurchaseSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Enter a product name to search.");
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      let dateOpts: { startDate?: string; endDate?: string } = {};
      if (preset !== "custom" && preset !== "all") {
        const pr = presetRange(preset);
        if (pr) dateOpts = pr;
      } else if (preset === "custom" && startDate && endDate) {
        dateOpts = { startDate, endDate };
      }
      const res = await searchFn({ data: { query: q, ...dateOpts } });
      if (res && "setupRequired" in res && res.setupRequired) {
        setError("Integration not configured. Please complete setup in Settings.");
        return;
      }
      const r = res as { result: CustomerPurchaseSearchResult };
      setResult(r.result);
    } catch (e: any) {
      setError(e?.message ?? "Failed to search.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, preset, startDate, endDate, searchFn]);

  useEffect(() => {
    if (!searched) void runSearch();
  }, [runSearch, searched]);

  const handlePresetChange = (v: string) => {
    setPreset(v);
    if (v === "custom") {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleExport = (mode: "purchases" | "customers") => {
    if (!result || result.buyers.length === 0) return;
    const ts = new Date().toISOString().slice(0, 10);
    const safeQ =
      query
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .toLowerCase() || "product";

    if (mode === "customers") {
      const customerMap = new Map<
        string,
        {
          name: string;
          phone: string | null;
          email: string | null;
          orders: number;
          qty: number;
          spend: number;
          first: number;
          last: number;
        }
      >();
      for (const b of result.buyers) {
        const key = b.cloverCustomerId ?? b.customerName;
        const ex = customerMap.get(key) ?? {
          name: b.customerName,
          phone: b.phone,
          email: b.email,
          orders: 0,
          qty: 0,
          spend: 0,
          first: Infinity,
          last: 0,
        };
        ex.orders += 1;
        ex.qty += b.quantity;
        ex.spend += b.lineTotalCents;
        const t = new Date(b.purchaseDate).getTime();
        if (t < ex.first) ex.first = t;
        if (t > ex.last) ex.last = t;
        customerMap.set(key, ex);
      }
      const rows = Array.from(customerMap.values()).map((c) => ({
        "Full Name": c.name,
        Phone: c.phone ?? "",
        Email: c.email ?? "",
        "Order Count": c.orders,
        "Total Quantity": c.qty,
        "Total Spend": (c.spend / 100).toFixed(2),
        "First Purchase": formatDate(c.first),
        "Last Purchase": formatDate(c.last),
      }));
      const csv = toCsv(rows as any, [
        { key: "Full Name", label: "Full Name" },
        { key: "Phone", label: "Phone" },
        { key: "Email", label: "Email" },
        { key: "Order Count", label: "Order Count" },
        { key: "Total Quantity", label: "Total Quantity" },
        { key: "Total Spend", label: "Total Spend" },
        { key: "First Purchase", label: "First Purchase" },
        { key: "Last Purchase", label: "Last Purchase" },
      ]);
      downloadCsv(csv, `${safeQ}-buyers-${ts}.csv`);
    } else {
      const rows = result.buyers.map((b) => ({
        "Full Name": b.customerName,
        Phone: b.phone ?? "",
        Email: b.email ?? "",
        Product: result.itemName,
        Quantity: b.quantity,
        "Unit Price": (b.unitPriceCents / 100).toFixed(2),
        "Line Total": (b.lineTotalCents / 100).toFixed(2),
        "Purchase Date": formatDate(new Date(b.purchaseDate).getTime()),
        "Order ID": b.cloverOrderId,
      }));
      const csv = toCsv(rows as any, [
        { key: "Full Name", label: "Full Name" },
        { key: "Phone", label: "Phone" },
        { key: "Email", label: "Email" },
        { key: "Product", label: "Product" },
        { key: "Quantity", label: "Quantity" },
        { key: "Unit Price", label: "Unit Price" },
        { key: "Line Total", label: "Line Total" },
        { key: "Purchase Date", label: "Purchase Date" },
        { key: "Order ID", label: "Order ID" },
      ]);
      downloadCsv(csv, `${safeQ}-purchases-${ts}.csv`);
    }
  };

  const uniqueCustomers = result
    ? new Set(result.buyers.map((b) => b.cloverCustomerId ?? b.customerName)).size
    : 0;

  return (
    <div>
      <PageHeader
        title="Product Buyer Search"
        description="Find every customer who purchased a specific product — for outreach and CRM tagging."
      />

      <div className="space-y-5">
        {/* Search controls */}
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="product-search"
                    className="mb-1.5 block text-xs font-bold text-muted-foreground"
                  >
                    Product name
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="product-search"
                      placeholder="e.g. Tacos, Wings, Margarita…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSearch()}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-muted-foreground">
                    Date range
                  </label>
                  <Select value={preset} onValueChange={handlePresetChange}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="ytd">Year to Date</SelectItem>
                      <SelectItem value="custom">Custom Range…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={runSearch} disabled={loading} className="sm:mb-px">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>

              {preset === "custom" && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div>
                    <label
                      htmlFor="start-date"
                      className="mb-1.5 block text-xs font-bold text-muted-foreground"
                    >
                      Start date
                    </label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="end-date"
                      className="mb-1.5 block text-xs font-bold text-muted-foreground"
                    >
                      End date
                    </label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Unique Customers" value={String(uniqueCustomers)} tone="default" />
              <StatCard
                label="Matching Purchases"
                value={String(result.buyers.length)}
                tone="default"
              />
              <StatCard
                label="Total Quantity"
                value={String(result.totalQuantity)}
                tone="default"
              />
              <StatCard
                label="CRM Matched"
                value={String(result.matchedGhlContactsCount)}
                tone="success"
              />
            </div>

            {/* Export + view toggle */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">
                    {result.itemName} —{" "}
                    {view === "customers"
                      ? `${uniqueCustomers} customers`
                      : `${result.buyers.length} purchases`}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customers">Unique Customers</SelectItem>
                        <SelectItem value="purchases">All Purchases</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport("customers")}
                      disabled={result.buyers.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export Customers
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport("purchases")}
                      disabled={result.buyers.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export Purchases
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {result.buyers.length === 0 ? (
                  <div className="p-8">
                    <EmptyState
                      title="No matching purchases"
                      description={`No orders containing "${query.trim()}" were found${preset !== "all" ? " in the selected date range" : ""}.`}
                    />
                  </div>
                ) : view === "purchases" ? (
                  <PurchasesTable buyers={result.buyers} itemName={result.itemName} />
                ) : (
                  <CustomersTable buyers={result.buyers} />
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!result && !error && !loading && (
          <EmptyState
            title="Search for a product"
            description="Enter a product name above and click Search to find every customer who purchased it."
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success";
}) {
  return (
    <div
      className={
        tone === "success"
          ? "rounded-2xl border border-success/25 bg-success/8 p-4"
          : "rounded-2xl border border-border bg-card p-4"
      }
      style={
        tone === "success"
          ? { backgroundColor: "color-mix(in oklab, var(--success) 8%, var(--card))" }
          : undefined
      }
    >
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function CustomersTable({ buyers }: { buyers: CustomerPurchaseSearchResult["buyers"] }) {
  const customerMap = new Map<
    string,
    {
      name: string;
      phone: string | null;
      email: string | null;
      orders: number;
      qty: number;
      spend: number;
      first: number;
      last: number;
      ghl: boolean;
    }
  >();
  for (const b of buyers) {
    const key = b.cloverCustomerId ?? b.customerName;
    const ex = customerMap.get(key) ?? {
      name: b.customerName,
      phone: b.phone,
      email: b.email,
      orders: 0,
      qty: 0,
      spend: 0,
      first: Infinity,
      last: 0,
      ghl: false,
    };
    ex.orders += 1;
    ex.qty += b.quantity;
    ex.spend += b.lineTotalCents;
    const t = new Date(b.purchaseDate).getTime();
    if (t < ex.first) ex.first = t;
    if (t > ex.last) ex.last = t;
    if (b.ghlContactId) ex.ghl = true;
    customerMap.set(key, ex);
  }
  const customers = Array.from(customerMap.values()).sort((a, b) => b.last - a.last);
  const {
    page,
    setPage,
    totalPages,
    pagedRows: pagedCustomers,
    total,
  } = usePagination(customers, [buyers]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead>First Purchase</TableHead>
            <TableHead>Last Purchase</TableHead>
            <TableHead>CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedCustomers.map((c) => (
            <TableRow key={c.name}>
              <TableCell className="font-medium text-foreground">{c.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.phone ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
              <TableCell className="text-right">{c.orders}</TableCell>
              <TableCell className="text-right">{c.qty}</TableCell>
              <TableCell className="text-right font-medium">{money(c.spend)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(c.first)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(c.last)}</TableCell>
              <TableCell>
                {c.ghl ? (
                  <Badge className="bg-success/15 text-success hover:bg-success/20">Matched</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    —
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 pb-4">
        <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
      </div>
    </div>
  );
}

function PurchasesTable({
  buyers,
  itemName,
}: {
  buyers: CustomerPurchaseSearchResult["buyers"];
  itemName: string;
}) {
  const {
    page,
    setPage,
    totalPages,
    pagedRows: pagedBuyers,
    total,
  } = usePagination(buyers, [buyers]);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Line Total</TableHead>
            <TableHead>Purchase Date</TableHead>
            <TableHead>Order ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedBuyers.map((b, i) => (
            <TableRow key={`${b.cloverOrderId}-${i}`}>
              <TableCell className="font-medium text-foreground">{b.customerName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {b.phone ?? b.email ?? "—"}
              </TableCell>
              <TableCell>{itemName}</TableCell>
              <TableCell className="text-right">{b.quantity}</TableCell>
              <TableCell className="text-right">{money(b.unitPriceCents)}</TableCell>
              <TableCell className="text-right font-medium">{money(b.lineTotalCents)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(new Date(b.purchaseDate).getTime())}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {b.cloverOrderId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 pb-4">
        <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
      </div>
    </div>
  );
}
