import { useMemo, useState } from "react";
import { X, Phone, Mail, Link2, CheckCircle2, Plus, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { usePagination, Pager } from "@/components/purchase-mapping/pagination";
import type { AudienceResult } from "@/lib/integration/audience-build.server";
import { money } from "@/lib/integration/format";

export type AudienceMeta = {
  id: string;
  label: string;
  group: string;
  description: string;
};

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Compact list-style rule row — accent dot + name + desc + remove.    */
/* No bordered card; reads like a CRM filter chip row.                 */
/* ------------------------------------------------------------------ */
export function RuleRow({
  label,
  description,
  onRemove,
  tone = "and",
}: {
  label: string;
  description: string;
  onRemove: () => void;
  tone?: "and" | "or";
}) {
  const dot = tone === "and" ? "bg-primary" : "bg-accent";
  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 shadow-xs transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        aria-label={`Remove ${label}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline add-control: high-usability button trigger that opens       */
/* the audience select, with tactile active/hover states.             */
/* ------------------------------------------------------------------ */
export function AddCondition({
  groups,
  placeholder,
  onPick,
  exclude,
}: {
  groups: [string, AudienceMeta[]][];
  placeholder: string;
  onPick: (id: string) => void;
  exclude: string[];
}) {
  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger className="group h-11 w-full rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-3.5 text-sm font-semibold text-foreground shadow-2xs transition-all hover:border-primary hover:bg-primary/[0.08] hover:shadow-xs active:scale-[0.99]">
        <span className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <SelectValue placeholder={placeholder} />
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-hover:text-foreground" />
      </SelectTrigger>
      <SelectContent className="max-h-80 w-[var(--radix-select-trigger-width)]">
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {group}
            </div>
            {items
              .filter((a) => !exclude.includes(a.id))
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex flex-col py-0.5">
                    <span className="font-semibold text-foreground">{a.label}</span>
                    <span className="text-[11px] text-muted-foreground">{a.description}</span>
                  </div>
                </SelectItem>
              ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* KPI strip — single horizontal bar, not five separate cards.         */
/* Dividers separate metrics; success tones tint the relevant cells.   */
/* ------------------------------------------------------------------ */
export function KpiStrip({
  total,
  eligible,
  phone,
  email,
  crm,
}: {
  total: number;
  eligible: number;
  phone: number;
  email: number;
  crm: number;
}) {
  const items = [
    { label: "Customers", value: total, tone: "neutral" as const },
    { label: "Mktg Eligible", value: eligible, tone: "success" as const },
    { label: "Phone", value: phone, tone: "neutral" as const },
    { label: "Email", value: email, tone: "neutral" as const },
    { label: "CRM Linked", value: crm, tone: "success" as const },
  ];
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className={
            "flex flex-col gap-1 px-4 py-3.5 " +
            (it.tone === "success" ? "bg-[color-mix(in_oklab,var(--success)_7%,var(--card))]" : "")
          }
        >
          <span
            className={
              "text-xs font-bold uppercase tracking-wide " +
              (it.tone === "success" ? "text-success" : "text-muted-foreground")
            }
          >
            {it.label}
          </span>
          <span className="text-2xl font-extrabold tabular-nums text-foreground">
            {it.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results table — CRM data-table with aligned columns + dividers.     */
/* ------------------------------------------------------------------ */
export function ResultsTable({
  customers,
  labelFor,
}: {
  customers: AudienceResult["customers"];
  labelFor: (id: string) => string;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  // Instant client-side filter by name, phone, or email.
  const filtered = useMemo(() => {
    if (!trimmed) return customers;
    return customers.filter((c) => {
      const name = (c.fullName ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return name.includes(trimmed) || phone.includes(trimmed) || email.includes(trimmed);
    });
  }, [customers, trimmed]);

  // Reset to page 1 whenever the filter or data changes.
  const { page, setPage, totalPages, pagedRows, total } = usePagination(filtered, [
    filtered,
    trimmed,
  ]);

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="h-9 rounded-lg border-border bg-muted/30 pl-9 text-sm placeholder:text-muted-foreground"
            aria-label="Search customers"
          />
        </div>
        {trimmed && (
          <button
            onClick={() => setQuery("")}
            className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Customer
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Phone
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Email
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Lifetime Spend
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Visits
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Last Visit
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                CRM
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Audiences
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow className="border-border">
                <TableCell
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No customers match “{query}”.
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((c) => (
                <TableRow key={c.cloverCustomerId} className="border-border hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-semibold text-foreground">
                    {c.fullName}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {c.phone ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {c.email ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-semibold tabular-nums">
                    {money(c.lifetimeSpendCents)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {c.visitCount}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(c.lastVisitMs)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {c.ghlContactId ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-xs font-bold text-success">
                        <Link2 className="h-3 w-3" /> Linked
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unlinked</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.matchingAudiences.slice(0, 2).map((id) => (
                        <Badge key={id} variant="outline" className="text-[10px] font-semibold">
                          {labelFor(id)}
                        </Badge>
                      ))}
                      {c.matchingAudiences.length > 2 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{c.matchingAudiences.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="px-4 pb-4">
        <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
      </div>
    </div>
  );
}

export { Phone, Mail, Link2, CheckCircle2 };
