// Server-only: public buildAudience API — combines audiences with AND/OR logic.
import type { AudienceId } from "./audience-types.server";
import { loadAggregates, type CustomerAgg } from "./audience-data.server";
import { resolveAudience } from "./audience-resolve.server";

export type AudienceResultCustomer = {
  cloverCustomerId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  marketingAllowed: boolean | null;
  ghlContactId: string | null;
  matchMethod: string | null;
  lifetimeSpendCents: number;
  visitCount: number;
  firstVisitMs: number;
  lastVisitMs: number;
  matchingAudiences: string[];
};

export type AudienceResult = {
  totalCustomers: number;
  marketingEligible: number;
  withPhone: number;
  withEmail: number;
  crmLinked: number;
  customers: AudienceResultCustomer[];
  audienceSizes: Record<string, number>;
  warnings: string[];
};

const BIRTHDAY_IDS: AudienceId[] = [
  "birthday_oct",
  "birthday_nov",
  "birthday_dec",
  "birthday_jan",
  "birthday_feb",
  "birthday_mar",
  "birthday_apr",
  "birthday_may",
  "birthday_jun",
  "birthday_jul",
];

/**
 * Build a combined audience. `andAudiences` are intersected (must match ALL).
 * `orGroups` is an array of arrays; within each group OR applies, and the
 * groups are ANDed together with the `andAudiences`.
 *
 * Example: wings AND sunday AND (inactive_30 OR inactive_60)
 *   andAudiences: ["wings_buyers", "sunday_football"]
 *   orGroups: [["inactive_30", "inactive_60"]]
 */
export async function buildAudience(
  andAudiences: AudienceId[],
  orGroups: AudienceId[][] = [],
): Promise<AudienceResult> {
  const { allCustomers } = await loadAggregates();
  const warnings: string[] = [];

  const sets = new Map<AudienceId, Set<string>>();
  const allIds = new Set<AudienceId>([...andAudiences, ...orGroups.flat()]);
  for (const id of allIds) {
    sets.set(id, resolveAudience(id, allCustomers));
  }

  const audienceSizes: Record<string, number> = {};
  for (const [id, s] of sets) audienceSizes[id] = s.size;

  let result: Set<string>;
  if (andAudiences.length > 0) {
    result = new Set(sets.get(andAudiences[0])!);
    for (let i = 1; i < andAudiences.length; i++) {
      const s = sets.get(andAudiences[i])!;
      result = new Set([...result].filter((x) => s.has(x)));
    }
  } else {
    result = new Set(allCustomers.map((c) => c.cloverCustomerId));
  }

  for (const group of orGroups) {
    if (group.length === 0) continue;
    const union = new Set<string>();
    for (const id of group) {
      const s = sets.get(id)!;
      for (const x of s) union.add(x);
    }
    result = new Set([...result].filter((x) => union.has(x)));
  }

  const byId = new Map(allCustomers.map((c) => [c.cloverCustomerId, c]));
  const customers: AudienceResultCustomer[] = [];
  let marketingEligible = 0,
    withPhone = 0,
    withEmail = 0,
    crmLinked = 0;

  for (const cid of result) {
    const c: CustomerAgg | undefined = byId.get(cid);
    if (!c) continue;
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Clover Customer";
    if (c.phone) withPhone++;
    if (c.email) withEmail++;
    if (c.ghlContactId) crmLinked++;
    const eligible = c.marketingAllowed !== false;
    if (eligible) marketingEligible++;

    const matching: string[] = [];
    for (const id of allIds) {
      if (sets.get(id)?.has(cid)) matching.push(id);
    }

    customers.push({
      cloverCustomerId: cid,
      fullName,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      marketingAllowed: c.marketingAllowed,
      ghlContactId: c.ghlContactId,
      matchMethod: c.matchMethod,
      lifetimeSpendCents: c.lifetimeSpend,
      visitCount: c.visitCount,
      firstVisitMs: c.firstVisit === Infinity ? 0 : c.firstVisit,
      lastVisitMs: c.lastVisit,
      matchingAudiences: matching,
    });
  }

  customers.sort((a, b) => b.lastVisitMs - a.lastVisitMs);

  if (BIRTHDAY_IDS.some((b) => allIds.has(b))) {
    warnings.push(
      "Birthday audiences return 0 customers — the Clover ingestion layer does not currently capture birthday data. Add a birthday column to the customers table to enable these segments.",
    );
  }

  return {
    totalCustomers: customers.length,
    marketingEligible,
    withPhone,
    withEmail,
    crmLinked,
    customers,
    audienceSizes,
    warnings,
  };
}
