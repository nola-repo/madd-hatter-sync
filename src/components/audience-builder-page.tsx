import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Loader2,
  Plus,
  X,
  Download,
  Users,
  AlertTriangle,
  Sparkles,
  Filter,
  Phone,
  Mail,
  Link2,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { usePagination, Pager } from "@/components/purchase-mapping/pagination";
import { useServerFn } from "@tanstack/react-start";
import { getAudienceCatalogFn, buildAudienceFn } from "@/lib/integration/audience.functions";
import type { AudienceResult } from "@/lib/integration/audience-build.server";
import { money } from "@/lib/integration/format";
import { toCsv, downloadCsv } from "@/lib/csv-export";

type AudienceMeta = { id: string; label: string; group: string; description: string };

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AudienceBuilderPage() {
  const catalogFn = useServerFn(getAudienceCatalogFn);
  const runFn = useServerFn(buildAudienceFn);

  const [catalog, setCatalog] = useState<AudienceMeta[]>([]);
  const [andAudiences, setAndAudiences] = useState<string[]>([]);
  const [orGroups, setOrGroups] = useState<string[][]>([[]]);
  const [result, setResult] = useState<AudienceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Load catalog once on mount.
  useEffect(() => {
    let cancelled = false;
    void catalogFn()
      .then((r) => {
        if (!cancelled) setCatalog(r.audiences as AudienceMeta[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [catalogFn]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const cleanOr = orGroups.filter((g) => g.length > 0);
      const res = await runFn({ data: { andAudiences, orGroups: cleanOr } });
      if (res && "setupRequired" in res && res.setupRequired) {
        setError("Integration not configured. Please complete setup in Settings.");
        return;
      }
      const r = res as { result: AudienceResult };
      setResult(r.result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build audience.";
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [andAudiences, orGroups, runFn]);

  const groups = useMemo(() => {
    const m = new Map<string, AudienceMeta[]>();
    for (const a of catalog) {
      const arr = m.get(a.group) ?? [];
      arr.push(a);
      m.set(a.group, arr);
    }
    return Array.from(m.entries());
  }, [catalog]);

  const labelFor = (id: string) => catalog.find((a) => a.id === id)?.label ?? id;
  const descFor = (id: string) => catalog.find((a) => a.id === id)?.description ?? "";

  const hasConditions = andAudiences.length > 0 || orGroups.some((g) => g.length > 0);
  const totalAudiences = catalog.length;

  // ---- AND filter management ----
  const addAnd = (id: string) => {
    if (!id || andAudiences.includes(id)) return;
    setAndAudiences([...andAudiences, id]);
  };
  const removeAnd = (id: string) => setAndAudiences(andAudiences.filter((x) => x !== id));

  // ---- OR group management ----
  const addOrToGroup = (gi: number, id: string) => {
    if (!id) return;
    const next = orGroups.map((g, i) => (i === gi ? Array.from(new Set([...g, id])) : g));
    setOrGroups(next);
  };
  const removeOrFromGroup = (gi: number, id: string) => {
    const next = orGroups.map((g, i) => (i === gi ? g.filter((x) => x !== id) : g));
    setOrGroups(next);
  };
  const addOrGroup = () => setOrGroups([...orGroups, []]);
  const removeOrGroup = (gi: number) => setOrGroups(orGroups.filter((_, i) => i !== gi));

  const clearAll = () => {
    setAndAudiences([]);
    setOrGroups([[]]);
    setResult(null);
    setSearched(false);
    setError(null);
  };

  const handleExport = () => {
    if (!result || result.customers.length === 0) return;
    const ts = new Date().toISOString().slice(0, 10);
    const rows = result.customers.map((c) => ({
      "Full Name": c.fullName,
      "First Name": c.firstName ?? "",
      "Last Name": c.lastName ?? "",
      Phone: c.phone ?? "",
      Email: c.email ?? "",
      "Clover Customer ID": c.cloverCustomerId,
      "GHL Contact ID": c.ghlContactId ?? "",
      "Lifetime Spend": (c.lifetimeSpendCents / 100).toFixed(2),
      "Visit Count": c.visitCount,
      "First Visit": formatDate(c.firstVisitMs),
      "Last Visit": formatDate(c.lastVisitMs),
      "Marketing Eligible": c.marketingAllowed === false ? "No" : "Yes",
      "Matching Audiences": c.matchingAudiences.map(labelFor).join("; "),
    }));
    const csv = toCsv(rows, [
      { key: "Full Name", label: "Full Name" },
      { key: "First Name", label: "First Name" },
      { key: "Last Name", label: "Last Name" },
      { key: "Phone", label: "Phone" },
      { key: "Email", label: "Email" },
      { key: "Clover Customer ID", label: "Clover Customer ID" },
      { key: "GHL Contact ID", label: "GHL Contact ID" },
      { key: "Lifetime Spend", label: "Lifetime Spend" },
      { key: "Visit Count", label: "Visit Count" },
      { key: "First Visit", label: "First Visit" },
      { key: "Last Visit", label: "Last Visit" },
      { key: "Marketing Eligible", label: "Marketing Eligible" },
      { key: "Matching Audiences", label: "Matching Audiences" },
    ]);
    downloadCsv(csv, `audience-${ts}.csv`);
  };

  return (
    <div>
      <PageHeader
        title="Audience Builder"
        description="Combine customer purchase, visit, spending, event, and birthday criteria into deduplicated outreach lists."
        actions={
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {totalAudiences} audiences available
          </Badge>
        }
      />

      <div className="space-y-5">
        {/* ---- Unified rules builder ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" /> Audience Conditions
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Build your audience by combining conditions. <strong>AND</strong> requires every
              condition to match (intersection). <strong>OR</strong> groups match any condition
              inside the group (union), and separate OR groups are combined with AND.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* AND section */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                  Match ALL
                </span>
                <span className="text-xs text-muted-foreground">
                  Customer must satisfy every condition below
                </span>
              </div>
              <div className="space-y-2">
                {andAudiences.map((id) => (
                  <RuleRow
                    key={id}
                    label={labelFor(id)}
                    description={descFor(id)}
                    onRemove={() => removeAnd(id)}
                  />
                ))}
                {andAudiences.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No AND conditions — all identified customers are included by default.
                  </p>
                )}
              </div>
              <div className="mt-2">
                <AudienceSelect
                  groups={groups}
                  placeholder="Add a condition that must match…"
                  onPick={addAnd}
                  exclude={andAudiences}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                and / or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* OR section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                    Match ANY
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Customer must match at least one condition per group
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={addOrGroup}>
                  <Plus className="h-3.5 w-3.5" /> Add OR group
                </Button>
              </div>

              <div className="space-y-3">
                {orGroups.map((group, gi) => (
                  <div key={gi} className="rounded-2xl border border-border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        OR group {gi + 1}
                      </span>
                      {orGroups.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => removeOrGroup(gi)}
                        >
                          <X className="h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {group.map((id) => (
                        <RuleRow
                          key={id}
                          label={labelFor(id)}
                          description={descFor(id)}
                          onRemove={() => removeOrFromGroup(gi, id)}
                          compact
                        />
                      ))}
                      {group.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                          Empty group — add an audience below.
                        </p>
                      )}
                    </div>
                    <div className="mt-2">
                      <AudienceSelect
                        groups={groups}
                        placeholder="Add to this OR group…"
                        onPick={(id) => addOrToGroup(gi, id)}
                        exclude={group}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---- Build actions ---- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={runSearch} disabled={loading || !hasConditions} size="lg">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Build Audience
            </Button>
            {hasConditions && (
              <Button variant="ghost" size="lg" onClick={clearAll}>
                <X className="h-4 w-4" /> Clear all
              </Button>
            )}
          </div>
          {hasConditions && (
            <div className="flex flex-wrap gap-1.5">
              {andAudiences.map((id) => (
                <Badge key={`sum-${id}`} variant="outline" className="text-[11px]">
                  {labelFor(id)}
                </Badge>
              ))}
              {orGroups.some((g) => g.length > 0) && andAudiences.length > 0 && (
                <span className="text-xs text-muted-foreground">·</span>
              )}
              {orGroups.map((g, gi) =>
                g.length > 0 ? (
                  <Badge
                    key={`sum-or-${gi}`}
                    className="gap-1 bg-accent/10 text-accent-foreground text-[11px]"
                  >
                    ANY: {g.map(labelFor).join(", ")}
                  </Badge>
                ) : null,
              )}
            </div>
          )}
        </div>

        {/* ---- Error ---- */}
        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </CardContent>
          </Card>
        )}

        {/* ---- Warnings (birthday, etc.) ---- */}
        {result && (
          <>
            {result.warnings.map((w, i) => (
              <Card key={i} className="border-warning/30 bg-warning/5">
                <CardContent className="flex items-start gap-2 p-4 text-sm text-warning">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </CardContent>
              </Card>
            ))}

            {/* ---- KPI cards ---- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                icon={<Users className="h-4 w-4" />}
                label="Unique Customers"
                value={String(result.totalCustomers)}
              />
              <KpiCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Marketing Eligible"
                value={String(result.marketingEligible)}
                tone="success"
              />
              <KpiCard
                icon={<Phone className="h-4 w-4" />}
                label="With Phone"
                value={String(result.withPhone)}
              />
              <KpiCard
                icon={<Mail className="h-4 w-4" />}
                label="With Email"
                value={String(result.withEmail)}
              />
              <KpiCard
                icon={<Link2 className="h-4 w-4" />}
                label="CRM Linked"
                value={String(result.crmLinked)}
                tone="success"
              />
            </div>

            {/* ---- Individual audience sizes ---- */}
            {Object.keys(result.audienceSizes).length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                    Individual audience sizes
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.audienceSizes).map(([id, n]) => (
                      <Badge key={id} variant="outline" className="gap-1.5">
                        {labelFor(id)} <span className="font-bold text-primary">{n}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ---- Results table ---- */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">
                    {result.totalCustomers} matching customers
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={result.customers.length === 0}
                  >
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {result.customers.length === 0 ? (
                  <div className="p-8">
                    <EmptyState
                      title="No matching customers"
                      description="No identified customers match the selected audience combination. Try widening your conditions."
                    />
                  </div>
                ) : (
                  <ResultsTable customers={result.customers} labelFor={labelFor} />
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ---- Initial empty state ---- */}
        {!result && !error && !loading && !searched && (
          <EmptyState
            title="Build your audience"
            description="Select conditions above and click Build Audience to find matching customers across all Clover purchase history. Combine AND/OR conditions to narrow or widen your reach."
          />
        )}

        {/* ---- Loading state ---- */}
        {loading && !result && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading customer purchase history and evaluating audiences…
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---- Compact rule row with description + remove ----
function RuleRow({
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
    <div className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {!compact && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AudienceSelect({
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
      <SelectTrigger className="w-full sm:w-80">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            {items
              .filter((a) => !exclude.includes(a.id))
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex flex-col">
                    <span>{a.label}</span>
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

function KpiCard({
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
          ? "rounded-2xl border border-success/25 p-4"
          : "rounded-2xl border border-border bg-card p-4"
      }
      style={
        tone === "success"
          ? { backgroundColor: "color-mix(in oklab, var(--success) 8%, var(--card))" }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <span className={tone === "success" ? "text-success" : "text-muted-foreground"}>
          {icon}
        </span>
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="mt-1.5 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function ResultsTable({
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Lifetime Spend</TableHead>
            <TableHead className="text-right">Visits</TableHead>
            <TableHead>Last Visit</TableHead>
            <TableHead>CRM</TableHead>
            <TableHead>Matching Audiences</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((c) => (
            <TableRow key={c.cloverCustomerId}>
              <TableCell className="font-medium text-foreground">{c.fullName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.phone ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
              <TableCell className="text-right font-medium">
                {money(c.lifetimeSpendCents)}
              </TableCell>
              <TableCell className="text-right">{c.visitCount}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(c.lastVisitMs)}
              </TableCell>
              <TableCell>
                {c.ghlContactId ? (
                  <Badge className="bg-success/15 text-success hover:bg-success/20">Linked</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    —
                  </Badge>
                )}
              </TableCell>
              <TableCell>
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
      <div className="px-4 pb-4">
        <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
      </div>
    </div>
  );
}
