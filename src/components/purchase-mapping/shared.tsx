// Shared presentational helpers for the Purchase Mapping monitor.
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type Range = "today" | "week" | "month" | "all";

// CRM contact detail URL. The locationId is the configured sub-account.
const CRM_LOCATION_ID = "7biYjalPZzmmvKaLw0WN";
export function crmContactUrl(contactId: string) {
  return `https://app.gohighlevel.com/sub-account/${CRM_LOCATION_ID}/contacts/${contactId}`;
}

export const STATUS_COLORS: Record<string, string> = {
  MAPPED: "default",
  MATCHED: "default",
  CONTACT_CREATED: "secondary",
  TAG_APPLIED: "default",
  ALREADY_TAGGED: "secondary",
  NO_CUSTOMER: "outline",
  NO_MATCH: "outline",
  NO_GHL_MATCH: "outline",
  NO_IDENTIFIERS: "outline",
  CONTACT_MATCH_CONFLICT: "destructive",
  CONFLICT: "destructive",
  MAPPING_FAILED: "destructive",
  SKIPPED_REFUNDED: "outline",
  UNMATCHED: "outline",
  NEEDS_REVIEW: "secondary",
  AMBIGUOUS_MATCH: "secondary",
};

export const SYNC_COLORS: Record<string, string> = {
  SYNCED: "default",
  PROCESSED: "secondary",
  PENDING: "outline",
  NO_CUSTOMER: "outline",
  NO_GHL_MATCH: "outline",
  NEEDS_REVIEW: "secondary",
  CONFLICT: "destructive",
  PARTIAL: "secondary",
  VOIDED: "outline",
  NOT_PAID: "outline",
};

/**
 * StatCard — success variant uses the green treatment for sync/log-related
 * positive metrics. Pass `tone="success" | "warning" | "error"` for semantic
 * coloring; default is neutral.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "stat-success"
      : tone === "warning"
        ? "stat-warning"
        : tone === "error"
          ? "stat-error"
          : "";
  const iconBg =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/20 text-warning"
        : tone === "error"
          ? "bg-destructive/15 text-destructive"
          : "bg-primary/10 text-primary";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
            {icon}
          </span>
        </div>
        <p className="mt-2 truncate text-xl font-extrabold tracking-tight text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <p className="text-base font-extrabold text-foreground">{value}</p>
    </div>
  );
}
