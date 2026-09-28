//
// Thin server-function wrappers. No runtime helpers here — all logic lives in
// imported .server.ts modules. Safe to import from client code.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkCloverConnection, fetchRecentCloverOrders } from "./clover.server";
import { checkGhlConnection } from "./ghl.server";
import { getIntegrationConfig, isSetupRequired, getMissingSecrets } from "./config.server";
import { buildOrderPreview, getSchemaValidation } from "./matching.server";
import { syncOrderToGhl } from "./sync.server";
import { getAdminSession } from "./auth.server";
import { getSupabaseServer } from "./supabase.server";
import {
    getDashboardStats,
    listOrders,
    listOrderItems,
    listCustomers,
    listProducts,
    listTransactions,
    listInventoryProducts,
    listCategories,
    listEmployees,
    listCustomerDetails,
    getOrderDetail,
} from "./pos-data.server";
import { refreshPosData, getLastSyncRun } from "./ingestion.server";
import {
    findCustomersByItem,
    tagCustomersByItem,
    getCustomerPurchaseHistory,
} from "./purchase-mapping.server";
import { processPendingPurchases } from "./purchase-ops.server";
import {
    getMappingMonitorStats,
    getCustomerMappingTable,
    getReviewQueue,
    getSyncedContacts,
} from "./customer-match.server";
import {
    getProductMappings,
    searchCustomerPurchasesByItem,
    getSyncLogs,
} from "./product-mapping.server";
import type { ConnectionStatus } from "./types";

function setupRequiredResponse(e: unknown) {
    return {
        setupRequired: true,
        missing: getMissingSecrets(e),
        message: (e as Error).message,
    } as const;
}

// ---- Auth guard helper -------------------------------------------------

async function requireAdmin() {
    const session = await getAdminSession();
    if (!session) {
        throw new Response("Unauthorized", { status: 401 });
    }
    return session;
}

// ---- Pre-auth Supabase connection test ---------------------------------
// Anonymous (no admin session): lets the login screen verify that the
// configured Supabase URL + publishable key + secret key are valid before
// the admin tries to sign in. Returns a clear, actionable result.

export const testSupabaseConnection = createServerFn({ method: "GET" }).handler(async () => {
    try {
        const cfg = getIntegrationConfig();
        const result = {
            url: cfg.supabase.url,
            secretKeyOk: false,
            publishableKeyOk: false,
            detail: "",
            adminUserCount: null as number | null,
        };

        // 1) Verify the SECRET key by calling the admin auth endpoint.
        try {
            const sb = getSupabaseServer();
            const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
            if (error) {
                result.detail = `Secret key check failed: ${error.message}`;
            } else {
                result.secretKeyOk = true;
                result.adminUserCount = data?.audits?.length ?? data?.users?.length ?? 0;
            }
        } catch (e: any) {
            result.detail = `Secret key check error: ${e?.message ?? "unknown"}`;
        }

        // 2) Verify the PUBLISHABLE key by hitting the public auth settings endpoint.
        try {
            const res = await fetch(`${cfg.supabase.url}/auth/v1/settings`, {
                headers: { apikey: cfg.supabase.publishableKey },
            });
            if (res.ok) {
                result.publishableKeyOk = true;
            } else {
                const body = await res.text().catch(() => "");
                result.detail = `${result.detail ? result.detail + " · " : ""}Publishable key check failed (HTTP ${res.status})${body ? `: ${body.slice(0, 120)}` : ""}`;
            }
        } catch (e: any) {
            result.detail = `${result.detail ? result.detail + " · " : ""}Publishable key check error: ${e?.message ?? "unknown"}`;
        }

        if (result.secretKeyOk && result.publishableKeyOk) {
            result.detail = `Connected to ${cfg.supabase.url}. Both keys valid.`;
        }
        return { setupRequired: false as const, result };
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});

// ---- Connection status -------------------------------------------------

export const getConnectionStatus = createServerFn({ method: "GET" }).handler(async () => {
    await requireAdmin();
    try {
        const cfg = getIntegrationConfig();
        // Supabase check: a simple query against the schema.
        let supabaseOk = false;
        let supabaseDetail = "";
        try {
            const sb = getSupabaseServer();
            const { error } = await sb.from("orders").select("id").limit(1);
            supabaseOk = !error;
            supabaseDetail = error ? error.message : `Connected to ${cfg.supabase.url}`;
        } catch (e: any) {
            supabaseDetail = e?.message ?? "Supabase not configured";
        }

        const clover = await checkCloverConnection();
        const ghl = await checkGhlConnection();

        const status: ConnectionStatus = {
            supabase: { connected: supabaseOk, detail: supabaseDetail },
            clover,
            ghl,
        };
        return status;
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});

// ---- Schema validation -------------------------------------------------

export const getSchemaStatus = createServerFn({ method: "GET" }).handler(async () => {
    await requireAdmin();
    try {
        const validation = await getSchemaValidation();
        return {
            setupRequired: false as const,
            ok: validation.ok,
            schema: validation.schema
                ? { id: validation.schema.id, name: validation.schema.name, key: validation.schema.key }
                : null,
            fields: validation.schema?.fields ?? [],
            missingFields: validation.missingFields,
            fieldKeyMap: validation.fieldKeyMap,
            debug: (validation as any).debug ?? null,
        };
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});

// ---- Clover live orders pull -------------------------------------------

export const getLiveCloverOrders = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({ limit: z.number().int().min(1).max(100).default(20) })
            .optional()
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const orders = await fetchRecentCloverOrders(data?.limit ?? 20);
            return { setupRequired: false as const, orders };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Order preview -----------------------------------------------------

export const previewOrder = createServerFn({ method: "GET" })
    .validator((data) => z.object({ orderId: z.string().min(1).max(200) }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const preview = await buildOrderPreview(data.orderId);
            return { setupRequired: false as const, preview };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Sync --------------------------------------------------------------

export const syncOrder = createServerFn({ method: "POST" })
    .validator((data) => z.object({ orderId: z.string().min(1).max(200) }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const result = await syncOrderToGhl(data.orderId);
            return { setupRequired: false as const, result };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const syncAllPaidOrdersToCustomObjectsFn = createServerFn({ method: "POST" })
    .validator((d: { limit?: number }) => d)
    .handler(async ({ data }) => {
        await requireAdmin();
        const { syncAllPaidOrders } = await import("./sync-all-paid.server");
        return await syncAllPaidOrders(data?.limit ?? 200);
    });

// ---- Dashboard stats ---------------------------------------------------

export const getDashboard = createServerFn({ method: "GET" })
    .validator((data?: { range?: "today" | "week" | "month" | "all" }) => data)
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const stats = await getDashboardStats(data);
            return { setupRequired: false as const, stats };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- POS data lists ----------------------------------------------------

const listSchema = z.object({
    search: z.string().optional(),
    paymentStatus: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
});

export const getOrdersList = createServerFn({ method: "GET" })
    .validator((data) => listSchema.parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listOrders({
                search: data.search,
                paymentStatus: data.paymentStatus,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getOrderItemsList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listOrderItems({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getCustomersList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listCustomers({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getProductsList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listProducts({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Refresh POS data (Clover ingestion) -------------------------------

export const refreshPos = createServerFn({ method: "POST" })
    .validator((data) =>
        z
            .object({
                kind: z.enum(["incremental", "full"]).default("incremental"),
                range: z.enum(["today", "week", "month", "3d", "7d", "30d", "all"]).optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional(),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const summary = await refreshPosData({
                kind: data.kind,
                range: data.range,
                startDate: data.startDate,
                endDate: data.endDate,
            });
            return { setupRequired: false as const, summary };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Last sync run status ----------------------------------------------

export const getLastSync = createServerFn({ method: "GET" }).handler(async () => {
    await requireAdmin();
    try {
        const last = await getLastSyncRun();
        return { setupRequired: false as const, last };
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});

// ---- Transactions list -------------------------------------------------

export const getTransactionsList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listTransactions({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Inventory products list -------------------------------------------

export const getInventoryProductsList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listInventoryProducts({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Categories list ---------------------------------------------------

export const getCategoriesList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listCategories({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Employees list ----------------------------------------------------

export const getEmployeesList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listEmployees({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Customer details list ---------------------------------------------

export const getCustomerDetailsList = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                search: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
                offset: z.number().int().min(0).default(0),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await listCustomerDetails({
                search: data.search,
                limit: data.limit,
                offset: data.offset,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Order detail ------------------------------------------------------

export const getOrderDetailFn = createServerFn({ method: "GET" })
    .validator((data) => z.object({ orderId: z.string().min(1).max(200) }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const detail = await getOrderDetail(data.orderId);
            return { setupRequired: false as const, detail };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Purchase mapping: "Who bought Wings?" ----------------------------
// Item → customer lookup, customer purchase history, and GHL purchase tagging.

export const findItemCustomers = createServerFn({ method: "GET" })
    .validator((data) =>
        z
            .object({
                itemId: z.string().optional(),
                itemName: z.string().optional(),
                range: z.enum(["today", "week", "month", "all"]).optional(),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await findCustomersByItem({
                itemId: data.itemId,
                itemName: data.itemName,
                range: data.range,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const tagItemCustomers = createServerFn({ method: "POST" })
    .validator((data) =>
        z
            .object({
                itemId: z.string().optional(),
                itemName: z.string().optional(),
                range: z.enum(["today", "week", "month", "all"]).optional(),
            })
            .parse(data),
    )
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const res = await tagCustomersByItem({
                itemId: data.itemId,
                itemName: data.itemName,
                range: data.range,
            });
            return { setupRequired: false as const, ...res };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getCustomerHistory = createServerFn({ method: "GET" })
    .validator((data) => z.object({ cloverCustomerId: z.string().min(1).max(200) }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const history = await getCustomerPurchaseHistory(data.cloverCustomerId);
            return { setupRequired: false as const, history };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

// ---- Purchase mapping monitor (admin) ---------------------------------

export const getMappingMonitorFn = createServerFn({ method: "GET" }).handler(async () => {
    await requireAdmin();
    try {
        const stats = await getMappingMonitorStats();
        return { setupRequired: false as const, stats };
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});

export const getMappingTableFn = createServerFn({ method: "GET" })
    .validator((data) => z.object({ limit: z.number().min(1).max(500).optional() }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const rows = await getCustomerMappingTable(data.limit ?? 100);
            return { setupRequired: false as const, rows };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getReviewQueueFn = createServerFn({ method: "GET" })
    .validator((data) => z.object({ limit: z.number().min(1).max(200).optional() }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const rows = await getReviewQueue(data.limit ?? 50);
            return { setupRequired: false as const, rows };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const processPendingPurchasesFn = createServerFn({ method: "POST" })
    .validator((data) => z.object({ limit: z.number().min(1).max(500).optional() }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const result = await processPendingPurchases(data.limit ?? 100);
            return { setupRequired: false as const, result };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });

export const getSyncedContactsFn = createServerFn({ method: "GET" })
    .validator((data) => z.object({ limit: z.number().min(1).max(500).optional() }).parse(data))
    .handler(async ({ data }) => {
        await requireAdmin();
        try {
            const result = await getSyncedContacts(data.limit ?? 100);
            return { setupRequired: false as const, ...result };
        } catch (e) {
            if (isSetupRequired(e)) return setupRequiredResponse(e);
            throw e;
        }
    });
