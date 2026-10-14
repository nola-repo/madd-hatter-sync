// Server-only: audience predicate evaluation + public segment builder API.
import {
  AUDIENCES, UFC_DATES, HALLOWEEN_DATES, THANKSGIVING_EVE_DATES,
  THANKSGIVING_DAY_DATES, type AudienceId, type BirthdayMonth,
} from "./audience-defs";
import {
  loadAllData, aggregateByCustomer, type LoadedData, type CustomerAgg,
  type EnrichedOrder,
} from "./audience-data.server";

export type AudienceCustomer = {
  cloverCustomerId: string;
  customerName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  marketingAllowed: boolean | null;
  ghlContactId: string | null;
  matchStatus: string;
  firstVisitMs: number;
  lastVisitMs: number;
  totalVisits: number;
  lifetimeSpendCents: number;
  qualifyingVisits: number;
  qualifyingSpendCents: number;
  favoriteItems: string[];
  eventNightsAttended: string[];
  birthdayMonth: number | null;
};

export type SegmentQuery = {
  include: AudienceId[];
  exclude: AudienceId[];
  marketingEligibleOnly?: boolean;
  birthdayMonth?: BirthdayMonth;
};

export type SegmentResult = {
  customers: AudienceCustomer[];
  totalTransactions: number;
  uniqueCustomers: number;
  customersWithPhone: number;
  customersWithEmail: number;
  marketingEligible: number;
  unlinked: number;
  qualifyingRevenueCents: number;
  averageCheckCents: number;
};

function itemMatches(name: string, keywords: string[]): boolean {
  const n = name.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

function inSeasonalWindow(localMonth: number): boolean {
  return localMonth >= 8 || localMonth <= 1;
}

function inOvernightWindow(localHour: number, startHour: number, spanHours: number): boolean {
  const end = startHour + spanHours;
  if (end <= 24) return localHour >= startHour && localHour < end;
  return localHour >= startHour || localHour < end - 24;
}

function hasVisitsPerMonth(agg: CustomerAgg, min: number): boolean {
  const monthCounts = new Map<string, number>();
  for (const o of agg.orders) {
    if (o.voided || o.paymentStatus !== "PAID") continue;
    const k = `${o.localYear}-${o.localMonth}`;
    monthCounts.set(k, (monthCounts.get(k) ?? 0) + 1);
  }
  return Array.from(monthCounts.values()).some((c) => c >= min);
}

function markEventNights(agg: CustomerAgg): void {
  const ufcSet = new Set(UFC_DATES);
  const hallowSet = new Set(HALLOWEEN_DATES);
  const tveSet = new Set(THANKSGIVING_EVE_DATES);
  for (const o of agg.orders) {
    if (ufcSet.has(o.localDateStr)) agg.eventNights.add(`UFC:${o.localDateStr}`);
    if (hallowSet.has(o.localDateStr)) agg.eventNights.add(`Halloween:${o.localDateStr}`);
    if (tveSet.has(o.localDateStr)) agg.eventNights.add(`TGEve:${o.localDateStr}`);
  }
}

export function qualifies(agg: CustomerAgg, id: AudienceId): boolean {
  const now = Date.now();
  switch (id) {
    case "wings": return agg.items.some((it) => itemMatches(it.itemName, ["wing"]));
    case "tacos": return agg.items.some((it) => itemMatches(it.itemName, ["taco"]));
    case "fishbowl": return agg.items.some((it) => itemMatches(it.itemName, ["fishbowl", "fish bowl"]));
    case "bottle_service":
      return agg.items.some((it) =>
        itemMatches(it.itemName, ["bottle service", "bottle svc", "btl ", "bottle"]) ||
        itemMatches(it.itemName, ["hennessy", "patron", "don julio", "tequila", "vodka", "whiskey", "whisky", "champagne", "moet", "ciroc"]));
    case "weekend_brunch":
      return agg.items.some((it) =>
        itemMatches(it.itemName, ["brunch"]) &&
        agg.orders.some((o) => o.orderId === it.orderId && (o.localDay === 0 || o.localDay === 6)));
    case "all_food": return agg.items.length > 0;
    case "sunday_football":
      return agg.orders.some((o) => o.localDay === 0 && inSeasonalWindow(o.localMonth));
    case "tuesday_visitors":
      return agg.orders.some((o) => o.localDay === 2 && inSeasonalWindow(o.localMonth));
    case "wednesday_karaoke":
      return agg.orders.some((o) => o.localDay === 3 && inOvernightWindow(o.localHour, 21, 5));
    case "weekday_daytime":
      return agg.orders.some((o) => o.localDay >= 1 && o.localDay <= 5 && o.localHour >= 11 && o.localHour < 20);
    case "thursday_nightlife":
      return agg.orders.some((o) => o.localDay === 4 && inOvernightWindow(o.localHour, 19, 8));
    case "friday_nightlife":
      return agg.orders.some((o) => o.localDay === 5 && inOvernightWindow(o.localHour, 19, 8));
    case "saturday_nightlife":
      return agg.orders.some((o) => o.localDay === 6 && inOvernightWindow(o.localHour, 19, 8));
    case "single_250": return agg.orders.some((o) => (o.totalCents || 0) > 25000);
    case "single_500": return agg.orders.some((o) => (o.totalCents || 0) > 50000);
    case "single_750": return agg.orders.some((o) => (o.totalCents || 0) > 75000);
    case "single_1000": return agg.orders.some((o) => (o.totalCents || 0) > 100000);
    case "visits_2_per_month": return hasVisitsPerMonth(agg, 2);
    case "visits_4_per_month": return hasVisitsPerMonth(agg, 4);
    case "inactive_30": return agg.lastVisitMs > 0 && now - agg.lastVisitMs > 30 * 86400000;
    case "inactive_60": return agg.lastVisitMs > 0 && now - agg.lastVisitMs > 60 * 86400000;
    case "inactive_90": return agg.lastVisitMs > 0 && now - agg.lastVisitMs > 90 * 86400000;
    case "lifetime_2500": return agg.lifetimeSpendCents > 250000;
    case "lifetime_5000": return agg.lifetimeSpendCents > 500000;
    case "multi_day_visitors": return agg.visitDows.size > 1;
    case "weekday_100":
      return agg.orders.some((o) => o.localDay >= 1 && o.localDay <= 5 && (o.totalCents || 0) > 10000);
    case "weekend_500":
      return agg.orders.some((o) => (o.localDay === 0 || o.localDay === 6) && (o.totalCents || 0) > 50000);
    case "first_time": return agg.totalVisits > 0 && now - agg.firstVisitMs <= 30 * 86400000;
    case "ufc": return agg.orders.some((o) => UFC_DATES.includes(o.localDateStr));
    case "halloween": return agg.orders.some((o) => HALLOWEEN_DATES.includes(o.localDateStr));
    case "thanksgiving_eve": return agg.orders.some((o) => THANKSGIVING_EVE_DATES.includes(o.localDateStr));
    case "thanksgiving_day": return agg.orders.some((o) => THANKSGIVING_DAY_DATES.includes(o.localDateStr));
    case "repeat_special_event": {
      markEventNights(agg);
      const distinct = new Set(Array.from(agg.eventNights).map((e) => e.split(":")[0]));
      return distinct.size >= 2;
    }
    case "birthday": return false; // birthday field not in schema
    default: return false;
  }
}

function buildCustomerRow(cid: string, agg: CustomerAgg, data: LoadedData): AudienceCustomer {
  const cust = data.customers.get(cid);
  const mapping = data.mappings.get(cid);
  markEventNights(agg);
  const favoriteItems = Array.from(agg.favoriteItems.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
  return {
    cloverCustomerId: cid,
    customerName: [cust?.firstName, cust?.lastName].filter(Boolean).join(" ") || "Clover Customer",
    firstName: cust?.firstName ?? null, lastName: cust?.lastName ?? null,
    phone: cust?.phone ?? null, email: cust?.email ?? null,
    marketingAllowed: cust?.marketingAllowed ?? null,
    ghlContactId: mapping?.ghlContactId ?? null,
    matchStatus: mapping?.matchStatus ?? (cust?.phone || cust?.email ? "NO_GHL_MATCH" : "NO_IDENTIFIERS"),
    firstVisitMs: agg.firstVisitMs === Infinity ? 0 : agg.firstVisitMs,
    lastVisitMs: agg.lastVisitMs, totalVisits: agg.totalVisits,
    lifetimeSpendCents: agg.lifetimeSpendCents,
    qualifyingVisits: agg.totalVisits, qualifyingSpendCents: agg.lifetimeSpendCents,
    favoriteItems, eventNightsAttended: Array.from(agg.eventNights),
    birthdayMonth: cust?.birthdayMonth ?? null,
  };
}

function finalize(customers: AudienceCustomer[], totalTx: number, qualRevenue: number): SegmentResult {
  const withPhone = customers.filter((c) => c.phone).length;
  const withEmail = customers.filter((c) => c.email).length;
  const mktEligible = customers.filter(
    (c) => Boolean(c.phone || c.email) && (c.marketingAllowed === true || c.marketingAllowed === null),
  ).length;
  const unlinked = customers.filter((c) => !c.ghlContactId).length;
  const paidTx = customers.reduce((s, c) => s + c.totalVisits, 0);
  return {
    customers, totalTransactions: totalTx, uniqueCustomers: customers.length,
    customersWithPhone: withPhone, customersWithEmail: withEmail,
    marketingEligible: mktEligible, unlinked,
    qualifyingRevenueCents: qualRevenue,
    averageCheckCents: paidTx > 0 ? Math.round(qualRevenue / paidTx) : 0,
  };
}

export async function buildSegment(query: SegmentQuery): Promise<SegmentResult> {
  const data = await loadAllData();
  const byCustomer = aggregateByCustomer(data);
  const qualifying = new Map<string, CustomerAgg>();

  if (query.include.length === 0 && query.exclude.length === 0) {
    for (const [cid, agg] of byCustomer) qualifying.set(cid, agg);
  } else {
    let first = true;
    if (query.include.length === 0) {
      for (const [cid, agg] of byCustomer) qualifying.set(cid, agg);
      first = false;
    }
    for (const aid of query.include) {
      const set = new Set<string>();
      for (const [cid, agg] of byCustomer) {
        if (qualifies(agg, aid)) set.add(cid);
      }
      if (first) {
        for (const cid of set) qualifying.set(cid, byCustomer.get(cid)!);
        first = false;
      } else {
        for (const cid of Array.from(qualifying.keys())) {
          if (!set.has(cid)) qualifying.delete(cid);
        }
      }
    }
  }

  for (const aid of query.exclude) {
    for (const [cid, agg] of byCustomer) {
      if (qualifying.has(cid) && qualifies(agg, aid)) qualifying.delete(cid);
    }
  }

  const customers: AudienceCustomer[] = [];
  let totalTx = 0;
  let qualRevenue = 0;
  for (const [cid, agg] of qualifying) {
    totalTx += agg.orders.length;
    qualRevenue += agg.lifetimeSpendCents;
    customers.push(buildCustomerRow(cid, agg, data));
  }

  if (query.marketingEligibleOnly) {
    const filtered = customers.filter(
      (c) => Boolean(c.phone || c.email) && (c.marketingAllowed === true || c.marketingAllowed === null),
    );
    return finalize(filtered, totalTx, qualRevenue);
  }

  customers.sort((a, b) => b.lifetimeSpendCents - a.lifetimeSpendCents);
  return finalize(customers, totalTx, qualRevenue);
}

export async function getAudienceCounts(): Promise<Array<{ id: AudienceId; label: string; group: string; count: number }>> {
  const data = await loadAllData();
  const byCustomer = aggregateByCustomer(data);
  const out: Array<{ id: AudienceId; label: string; group: string; count: number }> = [];
  for (const def of AUDIENCES) {
    let count = 0;
    for (const agg of byCustomer.values()) {
      if (qualifies(agg, def.id)) count++;
    }
    out.push({ id: def.id, label: def.label, group: def.group, count });
  }
  return out;
}
