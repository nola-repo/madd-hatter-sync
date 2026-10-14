import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  X,
  Download,
  Users,
  AlertTriangle,
  Sparkles,
  Filter,
  CalendarClock,
  Layers,
  Wand2,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { useServerFn } from "@tanstack/react-start";
import { getAudienceCatalogFn, buildAudienceFn } from "@/lib/integration/audience.functions";
import type { AudienceResult } from "@/lib/integration/audience-build.server";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import {
  RuleRow,
  AudienceSelect,
  KpiCard,
  ResultsTable,
  type AudienceMeta,
} from "@/components/audience-builder-parts";
import { CheckCircle2, Phone, Mail, Link2 } from "@/components/audience-builder-parts";

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
    <div className="mx-auto w-full max-w-[1400px]">
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

      <div className="space-y-6">
        {/* ---- Unified rules builder ---- */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </span>
              Audience Conditions
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Build your audience by combining conditions.{" "}
              <strong className="font-bold text-foreground">AND</strong> requires every condition to
              match (intersection). <strong className="font-bold text-foreground">OR</strong> groups
              match any condition inside the group (union), and separate OR groups are combined with
              AND.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* AND section */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Match ALL
                </span>
                <span className="text-sm text-muted-foreground">
                  Customer must satisfy every condition below
                </span>
              </div>
              <div className="space-y-2.5">
                {andAudiences.map((id) => (
                  <RuleRow
                    key={id}
                    label={labelFor(id)}
                    description={descFor(id)}
                    onRemove={() => removeAnd(id)}
                  />
                ))}
                {andAudiences.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
                    <p className="text-sm text-muted-foreground">
                      No AND conditions yet — all identified customers are included by default.
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <AudienceSelect
                  groups={groups}
                  placeholder="Add a condition that must match…"
                  onPick={addAnd}
                  exclude={andAudiences}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5" /> and / or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* OR section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                    <Layers className="h-3.5 w-3.5" /> Match ANY
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Customer must match at least one condition per group
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={addOrGroup}>
                  <Plus className="h-4 w-4" /> Add OR group
                </Button>
              </div>

              <div className="space-y-3">
                {orGroups.map((group, gi) => (
                  <div key={gi} className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        OR group {gi + 1}
                      </span>
                      {orGroups.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => removeOrGroup(gi)}
                        >
                          <X className="h-3.5 w-3.5" /> Remove group
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2.5">
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
                        <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-4 text-center">
                          <p className="text-sm text-muted-foreground">
                            Empty group — add an audience below.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={runSearch} disabled={loading || !hasConditions} size="lg">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Build Audience
            </Button>
            {hasConditions && (
              <Button variant="outline" size="lg" onClick={clearAll}>
                <X className="h-4 w-4" /> Clear all
              </Button>
            )}
          </div>
          {hasConditions && (
            <div className="flex flex-wrap items-center gap-1.5">
              {andAudiences.map((id) => (
                <Badge key={`sum-${id}`} variant="outline" className="gap-1 text-[11px]">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  {labelFor(id)}
                </Badge>
              ))}
              {orGroups.some((g) => g.length > 0) && andAudiences.length > 0 && (
                <span className="text-xs font-bold text-muted-foreground">·</span>
              )}
              {orGroups.map((g, gi) =>
                g.length > 0 ? (
                  <Badge
                    key={`sum-or-${gi}`}
                    className="gap-1 bg-accent/10 text-accent-foreground text-[11px]"
                  >
                    <Layers className="h-3 w-3" />
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
        {result &&
          result.warnings.map((w, i) => (
            <Card key={i} className="border-warning/30 bg-warning/5">
              <CardContent className="flex items-start gap-2 p-4 text-sm text-warning">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /> {w}
              </CardContent>
            </Card>
          ))}

        {/* ---- KPI cards ---- */}
        {result && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
        )}

        {/* ---- Individual audience sizes ---- */}
        {result && Object.keys(result.audienceSizes).length > 0 && (
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Individual audience sizes
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.audienceSizes).map(([id, n]) => (
                  <Badge key={id} variant="outline" className="gap-1.5 px-3 py-1">
                    {labelFor(id)} <span className="font-bold text-primary">{n}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- Results table ---- */}
        {result && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {result.totalCustomers} matching customers
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deduplicated by customer across all selected conditions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="default"
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
            <CardContent className="flex flex-col items-center justify-center gap-3 p-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
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
