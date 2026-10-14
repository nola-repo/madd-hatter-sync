// Server-only: audience definitions + verified event calendars from the
// Madd Hatter Hoboken Clover CRM Master Plan.

export type AudienceId =
  | "wings"
  | "sunday_football"
  | "tacos"
  | "tuesday_visitors"
  | "wednesday_karaoke"
  | "weekend_brunch"
  | "all_food"
  | "weekday_daytime"
  | "thursday_nightlife"
  | "friday_nightlife"
  | "saturday_nightlife"
  | "single_250"
  | "single_500"
  | "single_750"
  | "single_1000"
  | "bottle_service"
  | "visits_2_per_month"
  | "visits_4_per_month"
  | "inactive_30"
  | "inactive_60"
  | "inactive_90"
  | "lifetime_2500"
  | "lifetime_5000"
  | "fishbowl"
  | "multi_day_visitors"
  | "weekday_100"
  | "weekend_500"
  | "first_time"
  | "ufc"
  | "halloween"
  | "thanksgiving_eve"
  | "repeat_special_event"
  | "thanksgiving_day"
  | "birthday";

export type AudienceDef = {
  id: AudienceId;
  number: number;
  label: string;
  group: string;
  description: string;
};

export const AUDIENCES: AudienceDef[] = [
  {
    id: "wings",
    number: 1,
    label: "Wings Buyers",
    group: "Product",
    description: "Any historical wing item purchase.",
  },
  {
    id: "sunday_football",
    number: 2,
    label: "Sunday Football Visitors",
    group: "Day & Time",
    description: "Sundays within Sep–Feb seasonal windows.",
  },
  {
    id: "tacos",
    number: 3,
    label: "Taco Buyers",
    group: "Product",
    description: "Any historical taco item purchase.",
  },
  {
    id: "tuesday_visitors",
    number: 4,
    label: "Tuesday Visitors",
    group: "Day & Time",
    description: "Tuesdays in the same seasonal windows; all-time Tuesday variant.",
  },
  {
    id: "wednesday_karaoke",
    number: 5,
    label: "Wednesday Karaoke Visitors",
    group: "Day & Time",
    description: "Wednesday 9 PM through Thursday 2 AM.",
  },
  {
    id: "weekend_brunch",
    number: 6,
    label: "Weekend Brunch Buyers",
    group: "Product",
    description: "Brunch item purchased on Saturday or Sunday.",
  },
  {
    id: "all_food",
    number: 7,
    label: "All Food Buyers",
    group: "Product",
    description: "Any food item purchased, any day.",
  },
  {
    id: "weekday_daytime",
    number: 8,
    label: "Weekday Daytime Visitors",
    group: "Day & Time",
    description: "Monday–Friday, 11 AM–8 PM.",
  },
  {
    id: "thursday_nightlife",
    number: 9,
    label: "Thursday Nightlife Visitors",
    group: "Day & Time",
    description: "Thursday 7 PM through Friday 3 AM.",
  },
  {
    id: "friday_nightlife",
    number: 10,
    label: "Friday Nightlife Visitors",
    group: "Day & Time",
    description: "Friday 7 PM through Saturday 3 AM.",
  },
  {
    id: "saturday_nightlife",
    number: 11,
    label: "Saturday Nightlife Visitors",
    group: "Day & Time",
    description: "Saturday 7 PM through Sunday 3 AM.",
  },
  {
    id: "single_250",
    number: 12,
    label: "Single-Check $250+",
    group: "Spending",
    description: "At least one transaction strictly greater than $250.",
  },
  {
    id: "single_500",
    number: 13,
    label: "Single-Check $500+",
    group: "Spending",
    description: "At least one transaction strictly greater than $500.",
  },
  {
    id: "single_750",
    number: 14,
    label: "Single-Check $750+",
    group: "Spending",
    description: "At least one transaction strictly greater than $750.",
  },
  {
    id: "single_1000",
    number: 15,
    label: "Single-Check $1,000+",
    group: "Spending",
    description: "At least one transaction strictly greater than $1,000.",
  },
  {
    id: "bottle_service",
    number: 16,
    label: "Bottle-Service Buyers",
    group: "Product",
    description: "Any order of bottle-service / qualifying liquor bottle SKUs.",
  },
  {
    id: "visits_2_per_month",
    number: 17,
    label: "2+ Visits Per Month",
    group: "Loyalty",
    description: "Two or more visits in a month.",
  },
  {
    id: "visits_4_per_month",
    number: 18,
    label: "4+ Visits Per Month",
    group: "Loyalty",
    description: "Four or more visits in a month.",
  },
  {
    id: "inactive_30",
    number: 19,
    label: "Inactive 30 Days",
    group: "Lifecycle",
    description: "No identified visit in past 30 days.",
  },
  {
    id: "inactive_60",
    number: 20,
    label: "Inactive 60 Days",
    group: "Lifecycle",
    description: "No identified visit in past 60 days.",
  },
  {
    id: "inactive_90",
    number: 21,
    label: "Inactive 90 Days",
    group: "Lifecycle",
    description: "No identified visit in past 90 days.",
  },
  {
    id: "lifetime_2500",
    number: 22,
    label: "Lifetime Spender $2,500+",
    group: "Spending",
    description: "Cumulative identified spend exceeds $2,500.",
  },
  {
    id: "lifetime_5000",
    number: 23,
    label: "Lifetime Spender $5,000+",
    group: "Spending",
    description: "Cumulative identified spend exceeds $5,000.",
  },
  {
    id: "fishbowl",
    number: 24,
    label: "Fishbowl Buyers",
    group: "Product",
    description: "Any fishbowl menu-item purchase.",
  },
  {
    id: "multi_day_visitors",
    number: 25,
    label: "Multi-Day Visitors",
    group: "Day & Time",
    description: "Visits on more than one day of the week.",
  },
  {
    id: "weekday_100",
    number: 26,
    label: "Weekday $100+ Buyers",
    group: "Spending",
    description: "At least one qualifying weekday transaction over $100.",
  },
  {
    id: "weekend_500",
    number: 27,
    label: "Weekend $500+ Buyers",
    group: "Spending",
    description: "At least one qualifying weekend transaction over $500.",
  },
  {
    id: "first_time",
    number: 28,
    label: "First-Time Customers",
    group: "Lifecycle",
    description: "First identifiable visit; use for welcome offers.",
  },
  {
    id: "ufc",
    number: 29,
    label: "UFC Fight-Night Visitors",
    group: "Event",
    description: "All UFC event dates 2023–2025, 8 PM through actual close.",
  },
  {
    id: "halloween",
    number: 30,
    label: "Halloween Visitors",
    group: "Event",
    description: "Oct 26 & Oct 31, 2024; Oct 25 & Oct 31, 2025.",
  },
  {
    id: "thanksgiving_eve",
    number: 31,
    label: "Thanksgiving Eve Visitors",
    group: "Event",
    description: "Nov 27, 2024 and Nov 26, 2025.",
  },
  {
    id: "repeat_special_event",
    number: 32,
    label: "Repeat Special-Event Visitors",
    group: "Event",
    description: "Two or more qualifying UFC/Halloween/Thanksgiving Eve events.",
  },
  {
    id: "thanksgiving_day",
    number: 33,
    label: "Thanksgiving Day Visitors",
    group: "Event",
    description: "Nov 23, 2023; Nov 28, 2024; Nov 27, 2025.",
  },
  {
    id: "birthday",
    number: 34,
    label: "Birthday Master List",
    group: "Birthday",
    description: "Birthdays Oct–Jul, split into ten monthly subsegments.",
  },
];

export const BIRTHDAY_MONTHS = [
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
] as const;
export type BirthdayMonth = (typeof BIRTHDAY_MONTHS)[number];

// Verified event calendars from the master plan.
export const UFC_DATES: string[] = [
  "2023-01-14",
  "2023-01-21",
  "2023-02-04",
  "2023-02-18",
  "2023-03-04",
  "2023-03-18",
  "2023-04-08",
  "2023-04-22",
  "2023-04-29",
  "2023-05-06",
  "2023-05-13",
  "2023-05-20",
  "2023-06-03",
  "2023-06-10",
  "2023-06-17",
  "2023-07-01",
  "2023-07-08",
  "2023-07-15",
  "2023-07-22",
  "2023-07-29",
  "2023-08-05",
  "2023-08-12",
  "2023-08-19",
  "2023-08-26",
  "2023-09-09",
  "2023-09-16",
  "2023-10-07",
  "2023-10-14",
  "2023-10-21",
  "2023-11-04",
  "2023-11-11",
  "2023-11-18",
  "2023-12-02",
  "2023-12-09",
  "2023-12-16",
  "2024-01-13",
  "2024-01-20",
  "2024-02-03",
  "2024-02-10",
  "2024-02-17",
  "2024-03-02",
  "2024-03-09",
  "2024-03-23",
  "2024-04-06",
  "2024-04-13",
  "2024-04-27",
  "2024-05-04",
  "2024-05-11",
  "2024-05-18",
  "2024-06-01",
  "2024-06-08",
  "2024-06-15",
  "2024-06-22",
  "2024-06-29",
  "2024-07-06",
  "2024-07-13",
  "2024-07-20",
  "2024-07-27",
  "2024-08-03",
  "2024-08-10",
  "2024-08-17",
  "2024-08-31",
  "2024-09-07",
  "2024-09-14",
  "2024-09-28",
  "2024-10-05",
  "2024-10-12",
  "2024-10-19",
  "2024-10-26",
  "2024-11-02",
  "2024-11-09",
  "2024-11-16",
  "2024-11-23",
  "2024-12-07",
  "2024-12-14",
  "2025-01-11",
  "2025-01-18",
  "2025-02-08",
  "2025-02-15",
  "2025-03-01",
  "2025-03-08",
  "2025-03-22",
  "2025-04-05",
  "2025-04-12",
  "2025-04-26",
  "2025-05-03",
  "2025-05-10",
  "2025-05-17",
  "2025-06-07",
  "2025-06-14",
  "2025-06-21",
  "2025-06-28",
  "2025-07-19",
  "2025-08-02",
  "2025-08-16",
  "2025-09-06",
  "2025-09-13",
  "2025-09-20",
  "2025-09-27",
  "2025-10-04",
  "2025-10-11",
  "2025-10-18",
  "2025-10-25",
  "2025-11-01",
  "2025-11-08",
  "2025-11-15",
  "2025-11-22",
  "2025-12-06",
  "2025-12-13",
];

export const HALLOWEEN_DATES = ["2024-10-26", "2024-10-31", "2025-10-25", "2025-10-31"];
export const THANKSGIVING_EVE_DATES = ["2024-11-27", "2025-11-26"];
export const THANKSGIVING_DAY_DATES = ["2023-11-23", "2024-11-28", "2025-11-27"];

export const TZ = "America/New_York";
