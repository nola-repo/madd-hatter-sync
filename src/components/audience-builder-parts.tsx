import { X, Phone, Mail, Link2, CheckCircle2, Plus, ChevronDown } from "lucide-react";
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
    <div className="group flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/70">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Remove ${label}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline add-control: a ghost trigger that opens the audience select.  */
/* Replaces the wide standalone dropdown with a compact, discoverable  */
/* affordance that matches the rule rows.                              */
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
      <SelectTrigger className="h-9 w-full border-dashed bg-transparent text-sm font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground">
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <SelectValue placeholder={placeholder} />
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </SelectTrigger>
      <SelectContent>
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            {items
              .filter((a) => !exclude.includes(a.id))
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex flex-col">
                    <span className="font-semibold">{a.label}</span>
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
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
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
  const { page, setPage, totalPages, pagedRows, total } = usePagination(customers, [
    customers.length,
  ]);
  return (
    <div>
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
            {pagedRows.map((c) => (
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
            ))}
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
