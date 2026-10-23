// Server functions for Product Mappings, Customer Purchases search, and Execution Sync Logs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminSession } from "./auth.server";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import {
  getProductMappings,
  searchCustomerPurchasesByItem,
  getSyncLogs,
} from "./product-mapping.server";

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  } as const;
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

export const getProductMappingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  try {
    const products = await getProductMappings();
    return { setupRequired: false as const, products };
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});

export const searchCustomerPurchasesByItemFn = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        query: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    try {
      let dateOpts: { startMs?: number; endMs?: number } | undefined;
      if (data.startDate && data.endDate) {
        const { customDateRange } = await import("./clover-dates.server");
        const dr = customDateRange(data.startDate, data.endDate);
        dateOpts = { startMs: dr.startMs, endMs: dr.endMs };
      }
      const result = await searchCustomerPurchasesByItem(data.query, dateOpts);
      return { setupRequired: false as const, result };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });

export const getFilteredCustomerPurchasesFn = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        range: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    try {
      const { listFilteredCustomersWithPurchases } = await import("./customer-purchases.server");
      const res = await listFilteredCustomersWithPurchases({
        ...(data.search ? { search: data.search } : {}),
        limit: data.limit,
        offset: data.offset,
        ...(data.range && data.range !== "all" ? { range: data.range as any } : {}),
      });
      return { setupRequired: false as const, ...res };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });

export const getSyncLogsFn = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        limit: z.number().min(1).max(500).optional(),
        correlationId: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    try {
      const logs = await getSyncLogs(data.limit ?? 100, data.correlationId);
      return { setupRequired: false as const, logs };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });
