//
// Browser-safe audience preset definitions.
// Types only (no server imports). Imported by both the UI component and
// the server-side audience builder.

export type FilterType =
  | "single_check_gte"
  | "total_spend_gte"
  | "visit_count_gte"
  | "last_visit_within"
  | "category_buyer"
  | "item_buyer";

export type FilterCondition = {
  id: string;
  type: FilterType;
  thresholdDollars?: number;
  visitCount?: number;
  days?: number;
  name?: string;
  label: string;
  description: string;
};

export type ConditionGroup = {
  id: string;
  conditions: FilterCondition[];
};

export type AudienceQuery = {
  matchAllGroups: boolean;
  groups: ConditionGroup[];
  label?: string;
};

export type AudienceCustomerRow = {
  cloverCustomerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  matchStatus: "MATCHED" | "UNMATCHED" | "NO_IDENTIFIERS";
  orderCount: number;
  totalSpendCents: number;
  maxSingleOrderCents: number;
  lastVisitMs: number;
  matchedConditions: string[];
};

export type AudienceBuildResult = {
  customers: AudienceCustomerRow[];
  total: number;
  queryMs: number;
  summary: string;
};

// ---- Preset audience definitions (browser-safe, no server logic) ---------

export const AUDIENCE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  icon: string;
  query: () => AudienceQuery;
}> = [
  {
    id: "single_check_500",
    label: "Single-Check $500+",
    description: "At least one transaction ≥ $500",
    icon: "💳",
    query: () => ({
      matchAllGroups: true,
      label: "Single-Check $500+",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "single_check_gte" as FilterType,
              thresholdDollars: 500,
              label: "Single-Check $500+",
              description: "At least one transaction ≥ $500",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "single_check_750",
    label: "Single-Check $750+",
    description: "At least one transaction ≥ $750",
    icon: "💳",
    query: () => ({
      matchAllGroups: true,
      label: "Single-Check $750+",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "single_check_gte" as FilterType,
              thresholdDollars: 750,
              label: "Single-Check $750+",
              description: "At least one transaction ≥ $750",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "single_check_1000",
    label: "Single-Check $1000+",
    description: "At least one transaction ≥ $1,000",
    icon: "💳",
    query: () => ({
      matchAllGroups: true,
      label: "Single-Check $1000+",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "single_check_gte" as FilterType,
              thresholdDollars: 1000,
              label: "Single-Check $1000+",
              description: "At least one transaction ≥ $1,000",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "total_spend_500",
    label: "Total Spend $500+",
    description: "Cumulative spend ≥ $500",
    icon: "🏷️",
    query: () => ({
      matchAllGroups: true,
      label: "Total Spend $500+",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "total_spend_gte" as FilterType,
              thresholdDollars: 500,
              label: "Total Spend $500+",
              description: "Cumulative spend ≥ $500",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "total_spend_1000",
    label: "Total Spend $1000+",
    description: "Cumulative spend ≥ $1,000",
    icon: "🏷️",
    query: () => ({
      matchAllGroups: true,
      label: "Total Spend $1000+",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "total_spend_gte" as FilterType,
              thresholdDollars: 1000,
              label: "Total Spend $1000+",
              description: "Cumulative spend ≥ $1,000",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "merged_500_1000",
    label: "High-Value ($500+ OR $1000+)",
    description: "Single-check ≥ $500 OR total spend ≥ $1,000",
    icon: "⭐",
    query: () => ({
      matchAllGroups: false,
      label: "High-Value Customers ($500+ OR $1000+)",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "single_check_gte" as FilterType,
              thresholdDollars: 500,
              label: "Single-Check $500+",
              description: "At least one transaction ≥ $500",
            },
          ],
        },
        {
          id: "g2",
          conditions: [
            {
              id: "c2",
              type: "total_spend_gte" as FilterType,
              thresholdDollars: 1000,
              label: "Total Spend $1000+",
              description: "Cumulative spend ≥ $1,000",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "repeat_visitors",
    label: "Repeat Visitors (3+ visits)",
    description: "Customers who visited at least 3 times",
    icon: "🔁",
    query: () => ({
      matchAllGroups: true,
      label: "Repeat Visitors (3+ visits)",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "visit_count_gte" as FilterType,
              visitCount: 3,
              label: "3+ Visits",
              description: "Customers with 3 or more visits",
            },
          ],
        },
      ],
    }),
  },
  {
    id: "recent_30d",
    label: "Recent Customers (Last 30 Days)",
    description: "Visited within the last 30 days",
    icon: "📅",
    query: () => ({
      matchAllGroups: true,
      label: "Recent Customers (Last 30 Days)",
      groups: [
        {
          id: "g1",
          conditions: [
            {
              id: "c1",
              type: "last_visit_within" as FilterType,
              days: 30,
              label: "Visited in Last 30 Days",
              description: "Visited within the last 30 days",
            },
          ],
        },
      ],
    }),
  },
];
