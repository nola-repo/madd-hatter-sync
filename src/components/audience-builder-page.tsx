import { useCallback, useMemo, useState } from "react";
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
import { Loader2, Plus, X, Download, Users, AlertTriangle, Sparkles } from "lucide-react";
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
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [andAudiences, setAndAudiences] = useState<string[]>([]);
  const [orGroups, setOrGroups] = useState<string[][]>([[]]);
  const [result, setResult] = useState<AudienceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Load catalog once.
  if (!catalogLoaded) {
    setCatalogLoaded(true);
    void catalogFn()
      .then((r) => setCatalog(r.audiences as AudienceMeta[]))
      .catch(() => {});
  }

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
    } catch (e: any) {
      setError(e?.message ?? "Failed to build audience.");
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
    const csv = toCsv(rows as any, [
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
        description="Combine the 34 CRM master-plan audiences with AND/OR logic. Export deduplicated customer lists for outreach."
      />

      <div className="space-y-5">
        {/* AND filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Must match ALL of (AND)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {andAudiences.map((id) => (
                <Badge key={id} className="gap-1 bg-primary/10 text-primary hover:bg-primary/15">
                  {labelFor(id)}
                  <button
                    onClick={() => removeAnd(id)}
                    className="ml-0.5 rounded-full hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {andAudiences.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  No AND filters — all identified customers included.
                </span>
              )}
            </div>
            <AudienceSelect
              groups={groups}
              placeholder="Add AND filter…"
              onPick={addAnd}
              exclude={andAudiences}
            />
          </CardContent>
        </Card>

        {/* OR groups */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" /> Must match ANY of (OR groups)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={addOrGroup}>
                <Plus className="h-4 w-4" /> Add OR group
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {orGroups.map((group, gi) => (
              <div key={gi} className="rounded-2xl border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    OR group {gi + 1}
                  </span>
                  {orGroups.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeOrGroup(gi)}>
                      <X className="h-3 w-3" /> Remove group
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map((id) => (
                    <Badge key={id} variant="outline" className="gap-1">
                      {labelFor(id)}
                      <button
                        onClick={() => removeOrFromGroup(gi, id)}
                        className="ml-0.5 rounded-full hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {group.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      Empty — add an audience below.
                    </span>
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
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={runSearch} disabled={loading} size="lg">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Build Audience
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {result.warnings.map((w, i) => (
              <Card key={i} className="border-warning/30 bg-warning/5">
                <CardContent className="flex items-start gap-2 p-4 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {w}
                </CardContent>
              </Card>
            ))}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Unique Customers" value={String(result.totalCustomers)} />
              <StatCard
                label="Marketing Eligible"
                value={String(result.marketingEligible)}
                tone="success"
              />
              <StatCard label="With Phone" value={String(result.withPhone)} />
              <StatCard label="With Email" value={String(result.withEmail)} />
              <StatCard label="CRM Linked" value={String(result.crmLinked)} tone="success" />
            </div>

            {/* Individual audience sizes */}
            {Object.keys(result.audienceSizes).length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                    Selected audience sizes
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

            {/* Results table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">{result.totalCustomers} customers</CardTitle>
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
                      description="No identified customers match the selected audience combination."
                    />
                  </div>
                ) : (
                  <ResultsTable customers={result.customers} labelFor={labelFor} />
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!result && !error && !loading && !searched && (
          <EmptyState
            title="Build your audience"
            description="Select audiences above and click Build Audience to find matching customers across all Clover purchase history."
          />
        )}
      </div>
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
      <SelectTrigger className="w-full sm:w-72">
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
                  {a.label}
                </SelectItem>
              ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
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
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
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
