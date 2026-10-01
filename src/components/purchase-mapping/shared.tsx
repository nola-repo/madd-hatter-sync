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

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
