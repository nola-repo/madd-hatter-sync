// Server-only: audience type definitions and the master-plan audience registry.
import { normalizeItemName } from "./ghl-tags.server";

export type AudienceId =
  | "wings_buyers"
  | "taco_buyers"
  | "brunch_buyers"
  | "all_food_buyers"
  | "bottle_service_buyers"
  | "fishbowl_buyers"
  | "sunday_football"
  | "tuesday_visitors"
  | "wednesday_karaoke"
  | "weekday_daytime"
  | "thursday_nightlife"
  | "friday_nightlife"
  | "saturday_nightlife"
  | "multi_day_visitors"
  | "single_check_250"
  | "single_check_500"
  | "single_check_750"
  | "single_check_1000"
  | "visits_2_plus_month"
  | "visits_4_plus_month"
  | "inactive_30"
  | "inactive_60"
  | "inactive_90"
  | "lifetime_2500"
  | "lifetime_5000"
  | "weekday_check_100"
  | "weekend_check_500"
  | "first_time_customers"
  | "ufc_fight_night"
  | "halloween"
  | "thanksgiving_eve"
  | "repeat_special_event"
  | "thanksgiving_day"
  | "birthday_oct"
  | "birthday_nov"
  | "birthday_dec"
  | "birthday_jan"
  | "birthday_feb"
  | "birthday_mar"
  | "birthday_apr"
  | "birthday_may"
  | "birthday_jun"
  | "birthday_jul";

export type AudienceMeta = {
  id: AudienceId;
  label: string;
  group: string;
  description: string;
  /** When true, this audience has no active data source and will always
   *  return 0 members. The UI should display an 'unavailable' badge.
   *  Set `unavailableReason` to explain what is needed to enable it. */
  unavailable?: true;
  unavailableReason?: string;
};

export const AUDIENCES: AudienceMeta[] = [
  {
    id: "wings_buyers",
    label: "Wings Buyers",
    group: "Product",
    description: "Any historical wing item purchase.",
  },
  {
    id: "taco_buyers",
    label: "Taco Buyers",
    group: "Product",
    description: "Any historical taco item purchase.",
  },
  {
    id: "brunch_buyers",
    label: "Weekend Brunch Buyers",
    group: "Product",
    description: "Brunch item purchased on Saturday or Sunday.",
  },
  {
    id: "all_food_buyers",
    label: "All Food Buyers",
    group: "Product",
    description: "Any food item purchased, any day.",
  },
  {
    id: "bottle_service_buyers",
    label: "Bottle-Service Buyers",
    group: "Product",
    description: "Qualifying bottle-service / liquor bottle SKUs.",
  },
  {
    id: "fishbowl_buyers",
    label: "Fishbowl Buyers",
    group: "Product",
    description: "Any fishbowl menu-item purchase.",
  },
  {
    id: "sunday_football",
    label: "Sunday Football Visitors",
    group: "Day & Time",
    description: "Sundays, Sep–Feb across 3 seasonal windows.",
  },
  {
    id: "tuesday_visitors",
    label: "Tuesday Visitors",
    group: "Day & Time",
    description: "Tuesdays in the same seasonal windows + all-time variant.",
  },
  {
    id: "wednesday_karaoke",
    label: "Wednesday Karaoke",
    group: "Day & Time",
    description: "Wednesday 9 PM through Thursday 2 AM.",
  },
  {
    id: "weekday_daytime",
    label: "Weekday Daytime",
    group: "Day & Time",
    description: "Mon–Fri, 11 AM–8 PM.",
  },
  {
    id: "thursday_nightlife",
    label: "Thursday Nightlife",
    group: "Day & Time",
    description: "Thursday 7 PM through Friday 3 AM.",
  },
  {
    id: "friday_nightlife",
    label: "Friday Nightlife",
    group: "Day & Time",
    description: "Friday 7 PM through Saturday 3 AM.",
  },
  {
    id: "saturday_nightlife",
    label: "Saturday Nightlife",
    group: "Day & Time",
    description: "Saturday 7 PM through Sunday 3 AM.",
  },
  {
    id: "multi_day_visitors",
    label: "Multi-Day Visitors",
    group: "Day & Time",
    description: "Visits on more than one day of the week.",
  },
  {
    id: "single_check_250",
    label: "Single-Check $250+",
    group: "Spending & Loyalty",
    description: "At least one transaction >= $250.",
  },
  {
    id: "single_check_500",
    label: "Single-Check $500+",
    group: "Spending & Loyalty",
    description: "At least one transaction >= $500.",
  },
  {
    id: "single_check_750",
    label: "Single-Check $750+",
    group: "Spending & Loyalty",
    description: "At least one transaction >= $750.",
  },
  {
    id: "single_check_1000",
    label: "Single-Check $1,000+",
    group: "Spending & Loyalty",
    description: "At least one transaction >= $1,000.",
  },
  {
    id: "visits_2_plus_month",
    label: "2+ Visits / Month",
    group: "Spending & Loyalty",
    description: "Two or more visits in a calendar month.",
  },
  {
    id: "visits_4_plus_month",
    label: "4+ Visits / Month",
    group: "Spending & Loyalty",
    description: "Four or more visits in a calendar month.",
  },
  {
    id: "inactive_30",
    label: "Inactive 30 Days",
    group: "Spending & Loyalty",
    description: "No identified visit in past 30 days.",
  },
  {
    id: "inactive_60",
    label: "Inactive 60 Days",
    group: "Spending & Loyalty",
    description: "No identified visit in past 60 days.",
  },
  {
    id: "inactive_90",
    label: "Inactive 90 Days",
    group: "Spending & Loyalty",
    description: "No identified visit in past 90 days.",
  },
  {
    id: "lifetime_2500",
    label: "Lifetime Spender $2,500+",
    group: "Spending & Loyalty",
    description: "Cumulative identified spend >= $2,500.",
  },
  {
    id: "lifetime_5000",
    label: "Lifetime Spender $5,000+",
    group: "Spending & Loyalty",
    description: "Cumulative identified spend >= $5,000.",
  },
  {
    id: "weekday_check_100",
    label: "Weekday $100+ Buyers",
    group: "Spending & Loyalty",
    description: "At least one qualifying weekday transaction > $100.",
  },
  {
    id: "weekend_check_500",
    label: "Weekend $500+ Buyers",
    group: "Spending & Loyalty",
    description: "At least one qualifying weekend transaction > $500.",
  },
  {
    id: "first_time_customers",
    label: "First-Time Customers",
    group: "Spending & Loyalty",
    description: "First identifiable visit — for welcome offers.",
  },
  {
    id: "ufc_fight_night",
    label: "UFC Fight-Night Visitors",
    group: "Events & Holidays",
    description: "All UFC event dates 2023–2025, 8 PM through close.",
  },
  {
    id: "halloween",
    label: "Halloween Visitors",
    group: "Events & Holidays",
    description: "Oct 26 + Oct 31, 2024; Oct 25 + Oct 31, 2025.",
  },
  {
    id: "thanksgiving_eve",
    label: "Thanksgiving Eve Visitors",
    group: "Events & Holidays",
    description: "Nov 27, 2024 and Nov 26, 2025.",
  },
  {
    id: "repeat_special_event",
    label: "Repeat Special-Event Visitors",
    group: "Events & Holidays",
    description: "Attended 2+ qualifying UFC/Halloween/Thanksgiving Eve events.",
  },
  {
    id: "thanksgiving_day",
    label: "Thanksgiving Day Visitors",
    group: "Events & Holidays",
    description: "Nov 23, 2023; Nov 28, 2024; Nov 27, 2025.",
  },
  {
    id: "birthday_oct",
    label: "Birthday — October",
    group: "Birthday",
    description: "Birthdays Oct 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_nov",
    label: "Birthday — November",
    group: "Birthday",
    description: "Birthdays Nov 1–30.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_dec",
    label: "Birthday — December",
    group: "Birthday",
    description: "Birthdays Dec 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_jan",
    label: "Birthday — January",
    group: "Birthday",
    description: "Birthdays Jan 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_feb",
    label: "Birthday — February",
    group: "Birthday",
    description: "Birthdays Feb 1–29 (leap-day handled).",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_mar",
    label: "Birthday — March",
    group: "Birthday",
    description: "Birthdays Mar 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_apr",
    label: "Birthday — April",
    group: "Birthday",
    description: "Birthdays Apr 1–30.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_may",
    label: "Birthday — May",
    group: "Birthday",
    description: "Birthdays May 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_jun",
    label: "Birthday — June",
    group: "Birthday",
    description: "Birthdays Jun 1–30.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
  {
    id: "birthday_jul",
    label: "Birthday — July",
    group: "Birthday",
    description: "Birthdays Jul 1–31.",
    unavailable: true,
    unavailableReason: "Birthday data not yet ingested from Clover. All matches return 0.",
  },
];

// ---------------------------------------------------------------------------
// Product keyword matchers (master plan §1, §2A)
// ---------------------------------------------------------------------------

export function matchesProduct(itemName: string, keywords: string[]): boolean {
  const n = normalizeItemName(itemName).toLowerCase();
  return keywords.some((k) => n.includes(k));
}

export const WINGS_KEYWORDS = ["wing", "chicken wing", "boneless wing", "buffalo wing"];
export const TACO_KEYWORDS = ["taco", "tacos", "taco tues"];
export const BRUNCH_KEYWORDS = [
  "brunch",
  "eggs benedict",
  "mimosa",
  "french toast",
  "breakfast",
  "pancake",
  "omelet",
  "omelette",
];
export const FISHBOWL_KEYWORDS = ["fishbowl", "fish bowl"];
export const BOTTLE_KEYWORDS = [
  "bottle",
  "bottle service",
  "vodka bottle",
  "tequila bottle",
  "whiskey bottle",
  "rum bottle",
  "gin bottle",
  "champagne bottle",
  "prosecco",
  "hennessy",
  "patron",
  "don julio",
  "jack daniel",
  "jameson",
  "grey goose",
  "ciroc",
  "moet",
  "veuve",
  "dom perignon",
];
