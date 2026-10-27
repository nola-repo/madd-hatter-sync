import { useState, useCallback, useId, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { buildAudienceFn, getAudienceFilterOptions } from "@/lib/integration/integration.functions";
import { AUDIENCE_PRESETS } from "@/lib/integration/audience-presets";
import type {
  AudienceQuery,
  AudienceCustomerRow,
  FilterType,
  FilterCondition,
  ConditionGroup,
} from "@/lib/integration/audience-presets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Download,
  Plus,
  X,
  Sparkles,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
  Target,
  Clock,
  TrendingUp,
  CreditCard,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { money } from "@/lib/integration/format";
import { cn } from "@/lib/utils";

// ---- Types for filter options loaded from DB ----------------------------

type FilterOption = { name: string; count: number };
type FilterOptionsData = {
  items: FilterOption[];
  categories: FilterOption[];
};

// ---- Filter type metadata -----------------------------------------------

const FILTER_DEFS: Array<{
  type: FilterType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields: Array<"thresholdDollars" | "visitCount" | "days" | "name" | "category">;
  defaultValues: Partial<FilterCondition>;
}> = [
  {
    type: "single_check_gte",
    label: "Single-Check",
    description: "At least one transaction ≥ $X",
    icon: CreditCard,
    color: "text-emerald-400",
    fields: ["thresholdDollars"],
    defaultValues: { thresholdDollars: 500 },
  },
  {
    type: "total_spend_gte",
    label: "Total Spend",
    description: "Cumulative spending ≥ $X",
    icon: TrendingUp,
    color: "text-blue-400",
    fields: ["thresholdDollars"],
    defaultValues: { thresholdDollars: 500 },
  },
  {
    type: "visit_count_gte",
    label: "Visit Count",
    description: "At least X visits (orders)",
    icon: BarChart3,
    color: "text-amber-400",
    fields: ["visitCount"],
    defaultValues: { visitCount: 3 },
  },
  {
    type: "last_visit_within",
    label: "Recent Visit",
    description: "Last visit within X days",
    icon: Clock,
    color: "text-purple-400",
    fields: ["days"],
    defaultValues: { days: 30 },
  },
  {
    type: "category_buyer",
    label: "Category Buyer",
    description: "Purchased from a menu category",
    icon: Layers,
    color: "text-rose-400",
    fields: ["name"],
    defaultValues: { name: "" },
  },
  {
    type: "item_buyer",
    label: "Item Buyer",
    description: "Purchased a specific menu item",
    icon: Target,
    color: "text-cyan-400",
    fields: ["name"],
    defaultValues: { name: "" },
  },
];

function makeConditionLabel(cond: FilterCondition): string {
  switch (cond.type) {
    case "single_check_gte":
      return `Single-Check $${cond.thresholdDollars ?? 0}+`;
    case "total_spend_gte":
      return `Total Spend $${cond.thresholdDollars ?? 0}+`;
    case "visit_count_gte":
      return `${cond.visitCount ?? 1}+ Visits`;
    case "last_visit_within":
      return `Visited in Last ${cond.days ?? 30} Days`;
    case "category_buyer":
      return `Bought from "${cond.name}"`;
    case "item_buyer":
      return `Bought "${cond.name}"`;
    default:
      return "Unknown filter";
  }
}

function makeConditionDescription(cond: FilterCondition): string {
  switch (cond.type) {
    case "single_check_gte":
      return `At least one transaction ≥ $${cond.thresholdDollars ?? 0}`;
    case "total_spend_gte":
      return `Cumulative spending ≥ $${cond.thresholdDollars ?? 0}`;
    case "visit_count_gte":
      return `Visited at least ${cond.visitCount ?? 1} time${(cond.visitCount ?? 1) !== 1 ? "s" : ""}`;
    case "last_visit_within":
      return `Last visit within the past ${cond.days ?? 30} days`;
    case "category_buyer":
      return `Has purchased from "${cond.name}" category`;
    case "item_buyer":
      return `Has purchased "${cond.name}"`;
    default:
      return "";
  }
}

// ---- Searchable Picker --------------------------------------------------
// Replaces the free-text box for category_buyer / item_buyer with a
// dropdown populated from real DB data, with a search box inside it.

function NamePicker({
  value,
  options,
  placeholder,
  onChange,
  emptyLabel,
}: {
  value: string;
  options: FilterOption[];
  placeholder: string;
  onChange: (name: string) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  const hasValue = value.trim().length > 0;

  return (
    <div className="relative flex-1 min-w-40" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); setSearch(""); }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
          hasValue
            ? "border-zinc-600 bg-[#1A1A1E] text-white"
            : "border-[#27272A] bg-[#1A1A1E] text-zinc-500",
        )}
      >
        <span className="truncate">{hasValue ? value : placeholder}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-xl border border-[#27272A] bg-[#111113] shadow-xl overflow-hidden">
          {/* Search inside dropdown */}
          <div className="flex items-center gap-2 border-b border-[#1E1E22] px-2.5 py-2">
            <Search className="h-3 w-3 text-zinc-600 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${emptyLabel}…`}
              className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-300">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Option list */}
          <div className="max-h-52 overflow-y-auto">
            {/* Allow typing a custom value not in the list */}
            {search.trim() && !filtered.some((o) => o.name.toLowerCase() === search.toLowerCase()) && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 transition-colors border-b border-[#1E1E22]"
                onClick={() => { onChange(search.trim()); setOpen(false); setSearch(""); }}
              >
                <Plus className="h-3 w-3 text-zinc-500" />
                Use "<span className="font-semibold text-white">{search.trim()}</span>"
              </button>
            )}

            {filtered.length === 0 && !search.trim() && (
              <div className="py-6 text-center text-xs text-zinc-600">
                {options.length === 0 ? "Loading…" : "No results"}
              </div>
            )}

            {filtered.map((opt) => (
              <button
                key={opt.name}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-800",
                  value === opt.name ? "bg-zinc-800/60 text-white" : "text-zinc-300",
                )}
                onClick={() => { onChange(opt.name); setOpen(false); setSearch(""); }}
              >
                <span className="truncate">{opt.name}</span>
                <span className="shrink-0 text-[10px] font-mono text-zinc-600">×{opt.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Condition Editor ---------------------------------------------------

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  canRemove,
  filterOptions,
}: {
  condition: FilterCondition;
  onChange: (updated: FilterCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
  filterOptions: FilterOptionsData;
}) {
  const def = FILTER_DEFS.find((d) => d.type === condition.type)!;
  const Icon = def?.icon ?? Filter;

  const update = (patch: Partial<FilterCondition>) => {
    const updated = { ...condition, ...patch };
    updated.label = makeConditionLabel(updated);
    updated.description = makeConditionDescription(updated);
    onChange(updated);
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#222226] bg-[#0E0E11] p-3.5 group">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#18181B]",
          def?.color ?? "text-zinc-400",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Type selector */}
        <Select
          value={condition.type}
          onValueChange={(v) => {
            const newDef = FILTER_DEFS.find((d) => d.type === v)!;
            const base = { ...condition, type: v as FilterType, ...newDef.defaultValues };
            update({
              type: v as FilterType,
              ...newDef.defaultValues,
              label: makeConditionLabel(base),
              description: makeConditionDescription(base),
            });
          }}
        >
          <SelectTrigger className="h-8 border-[#27272A] bg-[#141417] text-xs text-[#F5F5F5] w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[#27272A] bg-[#141417] text-[#F5F5F5]">
            {FILTER_DEFS.map((fd) => (
              <SelectItem key={fd.type} value={fd.type} className="text-xs">
                {fd.label} — {fd.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value inputs */}
        <div className="flex flex-wrap gap-2">
          {/* Dollar threshold input */}
          {def?.fields.includes("thresholdDollars") && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-mono">$</span>
              <input
                type="number"
                min={0}
                step={50}
                value={condition.thresholdDollars ?? 500}
                onChange={(e) => update({ thresholdDollars: parseFloat(e.target.value) || 0 })}
                className="h-7 w-28 rounded-md border border-[#27272A] bg-[#1A1A1E] px-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <span className="text-[10px] text-zinc-500">or more</span>
            </div>
          )}

          {/* Visit count input */}
          {def?.fields.includes("visitCount") && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                step={1}
                value={condition.visitCount ?? 3}
                onChange={(e) => update({ visitCount: parseInt(e.target.value) || 1 })}
                className="h-7 w-20 rounded-md border border-[#27272A] bg-[#1A1A1E] px-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <span className="text-[10px] text-zinc-500">visits</span>
            </div>
          )}

          {/* Days input */}
          {def?.fields.includes("days") && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                step={1}
                value={condition.days ?? 30}
                onChange={(e) => update({ days: parseInt(e.target.value) || 1 })}
                className="h-7 w-20 rounded-md border border-[#27272A] bg-[#1A1A1E] px-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <span className="text-[10px] text-zinc-500">days</span>
            </div>
          )}

          {/* Category picker — real data from DB */}
          {condition.type === "category_buyer" && (
            <NamePicker
              value={condition.name ?? ""}
              options={filterOptions.categories}
              placeholder="Pick a category…"
              emptyLabel="categories"
              onChange={(name) => update({ name })}
            />
          )}

          {/* Item picker — real data from DB */}
          {condition.type === "item_buyer" && (
            <NamePicker
              value={condition.name ?? ""}
              options={filterOptions.items}
              placeholder="Pick a menu item…"
              emptyLabel="items"
              onChange={(name) => update({ name })}
            />
          )}
        </div>

        {/* Rendered label */}
        <p className="text-[10px] text-zinc-500 font-mono">{condition.description}</p>
      </div>

      <button
        onClick={onRemove}
        disabled={!canRemove}
        className={cn(
          "mt-0.5 h-6 w-6 shrink-0 flex items-center justify-center rounded-md transition-colors",
          canRemove
            ? "text-zinc-600 hover:text-red-400 hover:bg-red-950/30 cursor-pointer"
            : "text-zinc-800 cursor-not-allowed",
        )}
        title={canRemove ? "Remove condition" : "Cannot remove the only condition in a group"}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---- Group Editor -------------------------------------------------------

function GroupEditor({
  group,
  groupIndex,
  isOnly,
  onChange,
  onRemove,
  filterOptions,
}: {
  group: ConditionGroup;
  groupIndex: number;
  isOnly: boolean;
  onChange: (updated: ConditionGroup) => void;
  onRemove: () => void;
  filterOptions: FilterOptionsData;
}) {
  const uid = useId();

  const addCondition = () => {
    const def = FILTER_DEFS[0];
    const base: FilterCondition = {
      id: `${uid}-${Date.now()}`,
      type: def.type,
      ...def.defaultValues,
      label: "",
      description: "",
    };
    base.label = makeConditionLabel(base);
    base.description = makeConditionDescription(base);
    onChange({ ...group, conditions: [...group.conditions, base] });
  };

  const updateCondition = (idx: number, updated: FilterCondition) => {
    const conditions = [...group.conditions];
    conditions[idx] = updated;
    onChange({ ...group, conditions });
  };

  const removeCondition = (idx: number) => {
    if (group.conditions.length <= 1) return;
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  };

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#111113] p-4 space-y-3">
      {/* Group header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
            Group {groupIndex + 1}
          </span>
          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
            {group.conditions.length} condition{group.conditions.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {!isOnly && (
          <button
            onClick={onRemove}
            className="h-6 w-6 flex items-center justify-center rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            title="Remove group"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {group.conditions.map((cond, idx) => (
          <div key={cond.id}>
            {idx > 0 && (
              <div className="flex items-center gap-2 my-2">
                <div className="h-px flex-1 bg-[#1E1E22]" />
                <span className="text-[10px] font-mono text-zinc-600 px-2">OR</span>
                <div className="h-px flex-1 bg-[#1E1E22]" />
              </div>
            )}
            <ConditionEditor
              condition={cond}
              onChange={(u) => updateCondition(idx, u)}
              onRemove={() => removeCondition(idx)}
              canRemove={group.conditions.length > 1}
              filterOptions={filterOptions}
            />
          </div>
        ))}
      </div>

      {/* Add condition within group */}
      <button
        onClick={addCondition}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#27272A] py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add condition to group
      </button>
    </div>
  );
}

// ---- CSV Export ---------------------------------------------------------

function exportCSV(customers: AudienceCustomerRow[], label: string) {
  const rows = [
    ["Name", "Email", "Phone", "Clover ID", "GHL Contact ID", "Match Status", "Orders", "Total Spend", "Max Single Order", "Last Visit", "Matched Conditions"],
    ...customers.map((c) => [
      c.customerName,
      c.email ?? "",
      c.phone ?? "",
      c.cloverCustomerId,
      c.ghlContactId ?? "",
      c.matchStatus,
      c.orderCount.toString(),
      (c.totalSpendCents / 100).toFixed(2),
      (c.maxSingleOrderCents / 100).toFixed(2),
      c.lastVisitMs ? new Date(c.lastVisitMs).toLocaleDateString() : "",
      c.matchedConditions.join(" | "),
    ]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audience-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Main Page Component ------------------------------------------------

export function AudienceBuilderPage() {
  const buildFn = useServerFn(buildAudienceFn);
  const getFilterOptionsFn = useServerFn(getAudienceFilterOptions);
  const uid = useId();

  // ---- Filter options from DB (items + categories)
  const [filterOptions, setFilterOptions] = useState<FilterOptionsData>({ items: [], categories: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    getFilterOptionsFn({})
      .then((res) => {
        if (!res.setupRequired) {
          setFilterOptions({ items: res.items, categories: res.categories });
        }
      })
      .catch(() => {/* silently ignore - fallback to free text */})
      .finally(() => setOptionsLoading(false));
  }, []);

  // ---- Query state
  const [matchAllGroups, setMatchAllGroups] = useState(true);
  const [groups, setGroups] = useState<ConditionGroup[]>([
    {
      id: `${uid}-g0`,
      conditions: [
        {
          id: `${uid}-c0`,
          type: "single_check_gte",
          thresholdDollars: 500,
          label: "Single-Check $500+",
          description: "At least one transaction ≥ $500",
        },
      ],
    },
  ]);

  // ---- Results state
  const [result, setResult] = useState<{
    customers: AudienceCustomerRow[];
    total: number;
    queryMs: number;
    summary: string;
  } | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const audienceLabel = groups
    .flatMap((g) => g.conditions)
    .map((c) => c.label)
    .filter(Boolean)
    .join(", ") || "Audience";

  // ---- Build audience
  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setError(null);
    setResult(null);
    try {
      const query: AudienceQuery = { matchAllGroups, groups, label: audienceLabel };
      const res = await buildFn({ data: query });
      if (res.setupRequired) {
        setError("Setup required. Please configure your integrations in Settings.");
        return;
      }
      setResult({
        customers: res.customers,
        total: res.total,
        queryMs: res.queryMs,
        summary: res.summary,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to build audience. Please try again.");
    } finally {
      setBuilding(false);
    }
  }, [buildFn, matchAllGroups, groups, audienceLabel]);

  // ---- Apply a preset
  const applyPreset = (presetId: string) => {
    const preset = AUDIENCE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const q = preset.query();
    setMatchAllGroups(q.matchAllGroups);
    setGroups(
      q.groups.map((g, gi) => ({
        ...g,
        id: `${uid}-preset-g${gi}`,
        conditions: g.conditions.map((c, ci) => ({ ...c, id: `${uid}-preset-c${gi}-${ci}` })),
      })),
    );
    setActivePreset(presetId);
    setResult(null);
    setError(null);
  };

  // ---- Group management
  const addGroup = () => {
    const newId = `${uid}-g${Date.now()}`;
    const def = FILTER_DEFS[0];
    const cond: FilterCondition = {
      id: `${newId}-c0`,
      type: def.type,
      ...def.defaultValues,
      label: makeConditionLabel({ id: "", type: def.type, ...def.defaultValues, label: "", description: "" }),
      description: makeConditionDescription({ id: "", type: def.type, ...def.defaultValues, label: "", description: "" }),
    };
    setGroups((prev) => [...prev, { id: newId, conditions: [cond] }]);
    setActivePreset(null);
  };

  const updateGroup = (idx: number, updated: ConditionGroup) => {
    setGroups((prev) => prev.map((g, i) => (i === idx ? updated : g)));
    setActivePreset(null);
  };

  const removeGroup = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- Filtered results for search
  const filteredCustomers = (result?.customers ?? []).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.customerName.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      c.cloverCustomerId.toLowerCase().includes(q) ||
      (c.ghlContactId ?? "").toLowerCase().includes(q)
    );
  });

  const totalConditions = groups.reduce((acc, g) => acc + g.conditions.length, 0);

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <PageHeader
        title="Audience Builder"
        description="Combine purchase, visit, spending, and menu-item criteria into deduplicated outreach lists."
        actions={
          <div className="flex items-center gap-2">
            {optionsLoading ? (
              <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs gap-1.5">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                Loading menu…
              </Badge>
            ) : (
              <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-xs font-mono">
                {filterOptions.items.length} items · {filterOptions.categories.length} categories
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ---- LEFT: Builder Panel ---- */}
        <div className="space-y-4">
          {/* Presets */}
          <Card className="border-[#222226] bg-[#0E0E11]">
            <CardHeader className="pb-3 border-b border-[#1E1E22]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-zinc-400" />
                <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                  Quick Presets
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 p-3">
              <div className="grid grid-cols-2 gap-1.5">
                {AUDIENCE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all text-[11px]",
                      activePreset === preset.id
                        ? "border-zinc-500 bg-zinc-800/60 text-white"
                        : "border-[#1E1E22] bg-[#141417] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
                    )}
                  >
                    <span className="text-base mb-0.5">{preset.icon}</span>
                    <span className="font-medium leading-tight">{preset.label}</span>
                    <span className="text-zinc-600 text-[10px] leading-tight mt-0.5">{preset.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Audience Conditions Builder */}
          <Card className="border-[#222226] bg-[#0E0E11]">
            <CardHeader className="pb-3 border-b border-[#1E1E22]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-zinc-400" />
                  <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                    Audience Conditions
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
                  {totalConditions} rule{totalConditions !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 p-4 space-y-4">
              {/* MATCH ALL / MATCH ANY toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMatchAllGroups(true)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    matchAllGroups
                      ? "bg-white text-black"
                      : "bg-[#1A1A1E] text-zinc-400 hover:text-white border border-[#27272A]",
                  )}
                >
                  MATCH ALL
                </button>
                <button
                  onClick={() => setMatchAllGroups(false)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    !matchAllGroups
                      ? "bg-white text-black"
                      : "bg-[#1A1A1E] text-zinc-400 hover:text-white border border-[#27272A]",
                  )}
                >
                  MATCH ANY
                </button>
                <span className="text-[10px] text-zinc-600">
                  {matchAllGroups ? "Every group required" : "Any group matches"}
                </span>
              </div>

              {/* Groups */}
              <div className="space-y-3">
                {groups.map((group, gi) => (
                  <div key={group.id}>
                    {gi > 0 && !matchAllGroups && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="h-px flex-1 bg-[#1E1E22]" />
                        <span className="rounded-full border border-[#27272A] bg-[#111113] px-2.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-400">
                          OR
                        </span>
                        <div className="h-px flex-1 bg-[#1E1E22]" />
                      </div>
                    )}
                    {gi > 0 && matchAllGroups && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="h-px flex-1 bg-[#1E1E22]" />
                        <span className="text-[10px] font-mono text-zinc-600">AND</span>
                        <div className="h-px flex-1 bg-[#1E1E22]" />
                      </div>
                    )}
                    <GroupEditor
                      group={group}
                      groupIndex={gi}
                      isOnly={groups.length === 1}
                      onChange={(u) => updateGroup(gi, u)}
                      onRemove={() => removeGroup(gi)}
                      filterOptions={filterOptions}
                    />
                  </div>
                ))}
              </div>

              {/* Add group */}
              <button
                onClick={addGroup}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#27272A] py-2.5 text-[11px] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="h-3 w-3" />
                + Add Group
              </button>

              {/* Build button */}
              <Button
                onClick={handleBuild}
                disabled={building || totalConditions === 0}
                className="w-full bg-white hover:bg-zinc-200 text-zinc-950 font-semibold h-10 shadow-xs"
                id="build-audience-btn"
              >
                {building ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Building Audience…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Build Audience
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ---- RIGHT: Results Panel ---- */}
        <div className="space-y-4">
          {/* Error state */}
          {error && (
            <Alert variant="destructive" className="border-red-900/50 bg-red-950/20 text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Empty / prompt state */}
          {!result && !building && !error && (
            <Card className="border-[#222226] bg-[#0E0E11]">
              <CardContent className="py-20 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#141417] border border-[#222226]">
                  <Users className="h-8 w-8 text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-400">No audience built yet</p>
                <p className="mt-1 text-xs text-zinc-600 max-w-xs mx-auto">
                  Configure your filters on the left, then click <strong className="text-zinc-400">Build Audience</strong> to generate your customer list.
                </p>
                {!optionsLoading && filterOptions.items.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-sm mx-auto">
                    <span className="text-[10px] text-zinc-600 w-full mb-1">Popular items in your data:</span>
                    {filterOptions.items.slice(0, 8).map((item) => (
                      <span key={item.name} className="rounded-full border border-[#222226] bg-[#141417] px-2 py-0.5 text-[10px] text-zinc-500">
                        {item.name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Building indicator */}
          {building && (
            <Card className="border-[#222226] bg-[#0E0E11]">
              <CardContent className="py-20 text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-zinc-500 mx-auto mb-4" />
                <p className="text-sm text-zinc-400">Building audience…</p>
                <p className="mt-1 text-xs text-zinc-600">Scanning customer records and applying filters</p>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Summary bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#222226] bg-[#0E0E11] p-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#141417] border border-[#222226]">
                    <Users className="h-5 w-5 text-zinc-300" />
                  </div>
                  <div>
                    <div className="text-xl font-bold font-mono text-white tabular-nums">
                      {result.total.toLocaleString()}
                    </div>
                    <p className="text-xs text-zinc-400">{result.summary}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">Query: {result.queryMs}ms</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
                    <input
                      type="text"
                      placeholder="Filter results…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 pl-8 pr-3 rounded-lg border border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 w-48"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportCSV(result.customers, audienceLabel)}
                    className="h-9 border-[#27272A] bg-[#141417] text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5"
                    id="export-audience-csv-btn"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Results table */}
              <Card className="border-[#222226] bg-[#0E0E11]">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#1E1E22] bg-[#0A0A0C] text-[#71717A]">
                          <th className="py-3 px-4 font-medium">Customer</th>
                          <th className="py-3 px-4 font-medium">Contact</th>
                          <th className="py-3 px-4 font-medium text-right">Orders</th>
                          <th className="py-3 px-4 font-medium text-right">Total Spend</th>
                          <th className="py-3 px-4 font-medium text-right">Max Check</th>
                          <th className="py-3 px-4 font-medium">GHL Status</th>
                          <th className="py-3 px-4 font-medium">Matched On</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1A1A1E]">
                        {filteredCustomers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-zinc-600">
                              No customers match your search.
                            </td>
                          </tr>
                        ) : (
                          filteredCustomers.map((c) => (
                            <tr key={c.cloverCustomerId} className="hover:bg-[#0E0E10] transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-medium text-[#F5F5F5]">{c.customerName}</div>
                                <div className="font-mono text-[10px] text-zinc-600 truncate max-w-[120px]">
                                  {c.cloverCustomerId}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {c.email && (
                                  <div className="text-zinc-300 truncate max-w-[160px]">{c.email}</div>
                                )}
                                {c.phone && (
                                  <div className="font-mono text-zinc-500 text-[10px]">{c.phone}</div>
                                )}
                                {!c.email && !c.phone && (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-right text-[#E4E4E7]">
                                {c.orderCount}
                              </td>
                              <td className="py-3 px-4 font-mono text-right font-semibold text-emerald-400">
                                {money(c.totalSpendCents)}
                              </td>
                              <td className="py-3 px-4 font-mono text-right text-zinc-300">
                                {money(c.maxSingleOrderCents)}
                              </td>
                              <td className="py-3 px-4">
                                {c.matchStatus === "MATCHED" ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-800/40 bg-emerald-950/30 text-emerald-400 text-[10px] gap-1"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    GHL Synced
                                  </Badge>
                                ) : c.matchStatus === "UNMATCHED" ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-800/40 bg-amber-950/30 text-amber-400 text-[10px] gap-1"
                                  >
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    No GHL Match
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-zinc-700 bg-zinc-900/60 text-zinc-500 text-[10px]"
                                  >
                                    No Identifiers
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {c.matchedConditions.map((cond) => (
                                    <Badge
                                      key={cond}
                                      variant="outline"
                                      className="border-zinc-700 bg-zinc-900/40 text-zinc-400 text-[9px] py-0"
                                    >
                                      {cond}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredCustomers.length > 0 && (
                    <div className="border-t border-[#1E1E22] px-4 py-3 flex items-center justify-between">
                      <span className="text-xs text-zinc-600">
                        Showing {filteredCustomers.length.toLocaleString()} of {result.total.toLocaleString()} customers
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportCSV(result.customers, audienceLabel)}
                        className="h-8 border-[#27272A] bg-[#141417] text-xs text-zinc-300 hover:bg-zinc-800 gap-1.5"
                      >
                        <Download className="h-3 w-3" />
                        Download Full List (CSV)
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
