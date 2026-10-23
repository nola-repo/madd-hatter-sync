// Server-only: audience predicate resolver + public buildAudience API.
// Each audience is a pure predicate over a per-customer aggregate.
import type { AudienceId } from "./audience-types.server";
import {
  matchesProduct,
  WINGS_KEYWORDS,
  TACO_KEYWORDS,
  BRUNCH_KEYWORDS,
  FISHBOWL_KEYWORDS,
  BOTTLE_KEYWORDS,
} from "./audience-types.server";
import type { CustomerAgg } from "./audience-data.server";
import { wallParts } from "./audience-dates.server";
import {
  isDow,
  inDateRange,
  inOvernightWindow,
  inHourRange,
  isDate,
  inEventWindow,
  UFC_EVENT_DATES,
  HALLOWEEN_DATES,
  THANKSGIVING_EVE_DATES,
  THANKSGIVING_DAY_DATES,
  SUNDAY_FOOTBALL_WINDOWS,
} from "./audience-dates.server";

/** Resolve a single audience to a Set of customer IDs. */
export function resolveAudience(id: AudienceId, customers: CustomerAgg[]): Set<string> {
  const result = new Set<string>();
  const now = Date.now();

  for (const c of customers) {
    let match = false;

    switch (id) {
      // ---- Product-based (1-6) ----
      case "wings_buyers":
        match = c.items.some((it) => matchesProduct(it.item_name, WINGS_KEYWORDS));
        break;
      case "taco_buyers":
        match = c.items.some((it) => matchesProduct(it.item_name, TACO_KEYWORDS));
        break;
      case "brunch_buyers":
        match = c.orders.some((o) => {
          if (!isDow(o.created_time, 0) && !isDow(o.created_time, 6)) return false;
          const oi = c.items.filter((it) => it.clover_order_id === o.clover_order_id);
          return oi.some((it) => matchesProduct(it.item_name, BRUNCH_KEYWORDS));
        });
        break;
      case "all_food_buyers":
        match = c.items.length > 0;
        break;
      case "bottle_service_buyers":
        match = c.items.some((it) => matchesProduct(it.item_name, BOTTLE_KEYWORDS));
        break;
      case "fishbowl_buyers":
        match = c.items.some((it) => matchesProduct(it.item_name, FISHBOWL_KEYWORDS));
        break;

      // ---- Day/time/visit (7-14) ----
      case "sunday_football":
        match = c.orders.some(
          (o) =>
            isDow(o.created_time, 0) &&
            SUNDAY_FOOTBALL_WINDOWS.some(([s, e]) => inDateRange(o.created_time, s, e)),
        );
        break;
      case "tuesday_visitors":
        match = c.orders.some((o) => isDow(o.created_time, 2));
        break;
      case "wednesday_karaoke":
        match = c.orders.some((o) => inOvernightWindow(o.created_time, 3, 21, 2));
        break;
      case "weekday_daytime":
        match = c.orders.some((o) => {
          const { dow } = wallParts(o.created_time);
          return dow >= 1 && dow <= 5 && inHourRange(o.created_time, 11, 20);
        });
        break;
      case "thursday_nightlife":
        match = c.orders.some((o) => inOvernightWindow(o.created_time, 4, 19, 3));
        break;
      case "friday_nightlife":
        match = c.orders.some((o) => inOvernightWindow(o.created_time, 5, 19, 3));
        break;
      case "saturday_nightlife":
        match = c.orders.some((o) => inOvernightWindow(o.created_time, 6, 19, 3));
        break;
      case "multi_day_visitors":
        match = c.visitDows.size > 1;
        break;

      // ---- Spending / loyalty / lifecycle (15-28) ----
      case "single_check_250":
        match = c.orders.some((o) => (o.total_cents || 0) >= 25000);
        break;
      case "single_check_500":
        match = c.orders.some((o) => (o.total_cents || 0) >= 50000);
        break;
      case "single_check_750":
        match = c.orders.some((o) => (o.total_cents || 0) >= 75000);
        break;
      case "single_check_1000":
        match = c.orders.some((o) => (o.total_cents || 0) >= 100000);
        break;
      case "visits_2_plus_month":
        match = Array.from(c.visitsByMonth.values()).some((v) => v >= 2);
        break;
      case "visits_4_plus_month":
        match = Array.from(c.visitsByMonth.values()).some((v) => v >= 4);
        break;
      case "inactive_30":
        match = c.lastVisit > 0 && now - c.lastVisit > 30 * 86400000;
        break;
      case "inactive_60":
        match = c.lastVisit > 0 && now - c.lastVisit > 60 * 86400000;
        break;
      case "inactive_90":
        match = c.lastVisit > 0 && now - c.lastVisit > 90 * 86400000;
        break;
      case "lifetime_2500":
        match = c.lifetimeSpend >= 250000;
        break;
      case "lifetime_5000":
        match = c.lifetimeSpend >= 500000;
        break;
      case "weekday_check_100":
        match = c.orders.some((o) => {
          const { dow } = wallParts(o.created_time);
          return dow >= 1 && dow <= 5 && (o.total_cents || 0) > 10000;
        });
        break;
      case "weekend_check_500":
        match = c.orders.some((o) => {
          const { dow } = wallParts(o.created_time);
          return (dow === 0 || dow === 6) && (o.total_cents || 0) > 50000;
        });
        break;
      case "first_time_customers":
        match = c.firstVisit !== Infinity && now - c.firstVisit <= 30 * 86400000;
        break;

      // ---- Events / holidays (29-33) ----
      case "ufc_fight_night":
        match = c.orders.some((o) => UFC_EVENT_DATES.some((d) => inEventWindow(o.created_time, d)));
        break;
      case "halloween":
        // Master plan: "All identifiable visits on Halloween event date" — full
        // calendar day, not just the 8 PM–close nightlife window.
        match = c.orders.some((o) => HALLOWEEN_DATES.some((d) => isDate(o.created_time, d)));
        break;
      case "thanksgiving_eve":
        // Master plan: "All identifiable visitors" — full calendar day. The
        // "optional nightlife subset 7 PM-close" is a subset, not the definition.
        match = c.orders.some((o) => THANKSGIVING_EVE_DATES.some((d) => isDate(o.created_time, d)));
        break;
      case "thanksgiving_day":
        match = c.orders.some((o) => THANKSGIVING_DAY_DATES.some((d) => isDate(o.created_time, d)));
        break;
      case "repeat_special_event":
        // Master plan #32: "two or more distinct major event nights, including
        // UFC, Halloween, and Thanksgiving Eve." Thanksgiving Day is NOT a
        // "night" and is excluded from the repeat count.
        match =
          Array.from(c.eventNights).filter(
            (e) =>
              !e.startsWith("2023-11-23") &&
              !e.startsWith("2024-11-28") &&
              !e.startsWith("2025-11-27"),
          ).length >= 2;
        break;

      // ---- Birthday (34) — month subsegments ----
      // Birthday data is NOT currently captured by the Clover ingestion layer
      // (the customers table has no birthday column). These return empty sets
      // until birthday data is available. We do not fabricate birthdays.
      case "birthday_oct":
      case "birthday_nov":
      case "birthday_dec":
      case "birthday_jan":
      case "birthday_feb":
      case "birthday_mar":
      case "birthday_apr":
      case "birthday_may":
      case "birthday_jun":
      case "birthday_jul":
        match = false;
        break;
    }

    if (match) result.add(c.cloverCustomerId);
  }

  return result;
}
