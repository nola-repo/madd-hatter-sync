import { X, Phone, Mail, Link2, CheckCircle2 } from "lucide-react";
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

// ---- Compact rule row with description + remove ----
export function RuleRow({
  label,
  description,
  onRemove,
  compact,
}: {
  label: string;
  description: string;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-bold text-foreground">{label}</span>
        {!compact && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove ${label}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AudienceSelect({
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
    <Select
      value=""
      onValueChange={(v) => {
        onPick(v);
      }}
    >
      <SelectTrigger className="w-full sm:w-96">
        <SelectValue placeholder={placeholder} />
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

export function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div
      className={
        tone === "success"
          ? "rounded-2xl border border-success/25 p-5 shadow-sm"
          : "rounded-2xl border border-border bg-card p-5 shadow-sm"
      }
      style={
        tone === "success"
          ? { backgroundColor: "color-mix(in oklab, var(--success) 8%, var(--card))" }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={
            tone === "success"
              ? "flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success"
              : "flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          }
        >
          {icon}
        </span>
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="mt-3 text-3xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

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
            <TableRow className="bg-muted/30">
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                Customer
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                Phone
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                Email
              </TableHead>
              <TableHead className="h-11 px-4 text-right text-xs font-bold uppercase tracking-wide">
                Lifetime Spend
              </TableHead>
              <TableHead className="h-11 px-4 text-right text-xs font-bold uppercase tracking-wide">
                Visits
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                Last Visit
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                CRM
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-bold uppercase tracking-wide">
                Matching Audiences
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((c) => (
              <TableRow key={c.cloverCustomerId} className="hover:bg-muted/30">
                <TableCell className="px-4 py-3 font-semibold text-foreground">
                  {c.fullName}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {c.phone ?? "—"}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {c.email ?? "—"}
                </TableCell>
                <TableCell className="px-4 py-3 text-right font-semibold">
                  {money(c.lifetimeSpendCents)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right tabular-nums">{c.visitCount}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {formatDate(c.lastVisitMs)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {c.ghlContactId ? (
                    <Badge className="gap-1 bg-success/15 text-success hover:bg-success/20">
                      <Link2 className="h-3 w-3" /> Linked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Unlinked
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.matchingAudiences.slice(0, 3).map((id) => (
                      <Badge key={id} variant="outline" className="text-[10px]">
                        {labelFor(id)}
                      </Badge>
                    ))}
                    {c.matchingAudiences.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{c.matchingAudiences.length - 3}
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

// Re-export icons used by the page so they stay in one import graph.
export { Phone, Mail, Link2, CheckCircle2 };
