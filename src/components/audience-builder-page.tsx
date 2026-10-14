import { useCallback, useEffect, useMemo, useState } from "react";
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
  Target,
  RotateCcw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getAudienceCatalogFn, buildAudienceFn } from "@/lib/integration/audience.functions";
import type { AudienceResult } from "@/lib/integration/audience-build.server";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import {
  RuleRow,
  AddCondition,
  KpiStrip,
  ResultsTable,
  type AudienceMeta,
} from "@/components/audience-builder-parts";

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
  // Tracks whether the user changed conditions since the last build, so we
  // can mark displayed results as stale instead of hiding them.
  const [stale, setStale] = useState(false);

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
    setStale(false);
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
  const markStale = () => setStale(true);
  const addAnd = (id: string) => {
    if (!id || andAudiences.includes(id)) return;
    setAndAudiences([...andAudiences, id]);
    markStale();
  };
  const removeAnd = (id: string) => {
    setAndAudiences(andAudiences.filter((x) => x !== id));
    markStale();
  };

  // ---- OR group management ----
  const addOrToGroup = (gi: number, id: string) => {
    if (!id) return;
    const next = orGroups.map((g, i) => (i === gi ? Array.from(new Set([...g, id])) : g));
    setOrGroups(next);
    markStale();
  };
  const removeOrFromGroup = (gi: number, id: string) => {
    const next = orGroups.map((g, i) => (i === gi ? g.filter((x) => x !== id) : g));
    setOrGroups(next);
    markStale();
  };
  const addOrGroup = () => {
    setOrGroups([...orGroups, []]);
    markStale();
  };
  const removeOrGroup = (gi: number) => {
    setOrGroups(orGroups.filter((_, i) => i !== gi));
    markStale();
  };

  const clearAll = () => {
    setAndAudiences([]);
    setOrGroups([[]]);
    setResult(null);
    setSearched(false);
    setError(null);
    setStale(false);
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

  const activeConditionCount =
    andAudiences.length + orGroups.filter((g) => g.length > 0).reduce((n, g) => n + g.length, 0);

  return (
    <div className="mx-auto w-full">
      {/* ---- Compact header ---- */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Audience Builder
            </h1>
          </div>
          <p className="mt-1.5 pl-[46px] text-sm text-muted-foreground">
            Combine purchase, visit, spending, event & birthday criteria into deduplicated outreach
            lists.
          </p>
        </div>
        <Badge variant="outline" className="h-fit gap-1.5 px-3 py-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {totalAudiences} audiences available
        </Badge>
      </div>

      {/* ---- Split-screen workspace ---- */}
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,2.2fr)]">
        {/* ============ LEFT: Rule builder (sticky) ============ */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
              <Filter className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Conditions</span>
              {activeConditionCount > 0 && (
                <Badge className="ml-auto h-5 px-2 text-[11px]">{activeConditionCount}</Badge>
              )}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* ---- Match ALL (AND) ---- */}
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-primary">
                    Match all
                  </span>
                  <span className="text-xs text-muted-foreground">· every condition required</span>
                </div>
                <div className="space-y-2">
                  {andAudiences.map((id) => (
                    <RuleRow
                      key={id}
                      label={labelFor(id)}
                      description={descFor(id)}
                      onRemove={() => removeAnd(id)}
                      tone="and"
                    />
                  ))}
                  {andAudiences.length === 0 && (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No required conditions — all customers included.
                    </p>
                  )}
                  <AddCondition
                    groups={groups}
                    placeholder="Add required condition…"
                    onPick={addAnd}
                    exclude={andAudiences}
                  />
                </div>
              </div>

              {/* ---- Match ANY (OR groups) ---- */}
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-accent-foreground">
                      Match any
                    </span>
                    <span className="text-xs text-muted-foreground">· groups intersected</span>
                  </div>
                  <button
                    onClick={addOrGroup}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Group
                  </button>
                </div>

                <div className="space-y-3">
                  {orGroups.map((group, gi) => (
                    <div key={gi} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          <Layers className="h-3 w-3" /> Group {gi + 1}
                        </span>
                        {orGroups.length > 1 && (
                          <button
                            onClick={() => removeOrGroup(gi)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove group"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.map((id) => (
                          <RuleRow
                            key={id}
                            label={labelFor(id)}
                            description={descFor(id)}
                            onRemove={() => removeOrFromGroup(gi, id)}
                            tone="or"
                          />
                        ))}
                        {group.length === 0 && (
                          <p className="px-1 py-1 text-xs text-muted-foreground">
                            Empty — add a condition.
                          </p>
                        )}
                        <AddCondition
                          groups={groups}
                          placeholder="Add to group…"
                          onPick={(id) => addOrToGroup(gi, id)}
                          exclude={group}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---- Action bar (inside the rule panel) ---- */}
            <div className="mt-auto flex items-center gap-2.5 border-t border-border px-5 py-3.5">
              <Button
                onClick={runSearch}
                disabled={loading || !hasConditions}
                className="flex-1"
                size="default"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Build Audience
              </Button>
              {hasConditions && (
                <Button
                  variant="ghost"
                  size="default"
                  onClick={clearAll}
                  className="text-muted-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ============ RIGHT: Results dashboard ============ */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ---- Error ---- */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {/* ---- Birthday / data warnings ---- */}
          {result &&
            result.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
              >
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /> {w}
              </div>
            ))}

          {/* ---- Stale banner ---- */}
          {result && stale && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Conditions changed — results below are from a previous build.
            </div>
          )}

          {/* ---- Loading skeleton ---- */}
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-20 shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Evaluating audiences against purchase history…
              </p>
            </div>
          )}

          {/* ---- Results dashboard ---- */}
          {result && !loading && (
            <>
              {/* KPI strip */}
              <KpiStrip
                total={result.totalCustomers}
                eligible={result.marketingEligible}
                phone={result.withPhone}
                email={result.withEmail}
                crm={result.crmLinked}
              />

              {/* Individual audience sizes */}
              {Object.keys(result.audienceSizes).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.audienceSizes).map(([id, n]) => (
                    <Badge key={id} variant="outline" className="gap-1.5 px-2.5 py-1 text-[11px]">
                      {labelFor(id)} <span className="font-bold text-primary">{n}</span>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Results table panel */}
              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-2 border-b border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">
                      {result.totalCustomers.toLocaleString()} matching customers
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={result.customers.length === 0}
                  >
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                </div>
                {result.customers.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                    <p className="text-sm font-bold text-foreground">No matching customers</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      No identified customers match this combination. Try widening your conditions.
                    </p>
                  </div>
                ) : (
                  <ResultsTable customers={result.customers} labelFor={labelFor} />
                )}
              </div>
            </>
          )}

          {/* ---- Initial empty state ---- */}
          {!result && !error && !loading && !searched && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Target className="h-7 w-7" />
              </span>
              <p className="mt-4 text-base font-bold text-foreground">Build your audience</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Select conditions on the left and click Build Audience to find matching customers
                across all Clover purchase history.
              </p>
            </div>
          )}

          {/* ---- Zero-result state (searched but empty) ---- */}
          {result && result.customers.length === 0 && !loading && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <p className="text-sm font-bold text-foreground">No matching customers found</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Try removing a condition or switching AND to OR.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
