//
// Server-only: Product mapping, customer purchase search, and sync execution logs.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import { normalizeItemName, purchaseTagLabel } from "./ghl-tags.server";

export type ProductMappingRow = {
    id: string;
    cloverMerchantId: string;
    cloverItemId: string;
    itemName: string;
    normalizedItemName: string;
    categoryId: string | null;
    categoryName: string | null;
    priceCents: number;
    canonicalProductName: string;
    purchaseTagName: string;
    ghlMappingStatus: string;
    purchaseCount: number;
    lastSeenAt: string;
};

export type CustomerPurchaseSearchResult = {
    itemId: string | null;
    itemName: string;
    canonicalProduct: string;
    purchaseTag: string;
    totalBuyers: number;
    totalQuantity: number;
    totalSalesCents: number;
    matchedGhlContactsCount: number;
    tagsVerifiedCount: number;
    customObjectsSyncedCount: number;
    buyers: Array<{
        cloverCustomerId: string | null;
        customerName: string;
        phone: string | null;
        email: string | null;
        cloverOrderId: string;
        purchaseDate: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        ghlContactId: string | null;
        matchMethod: string | null;
        matchStatus: string | null;
        purchaseTag: string;
        tagStatus: string;
        customObjectRecordId: string | null;
        customObjectStatus: string;
    }>;
};

export type SyncLogEntry = {
    id: string;
    correlationId: string;
    cloverMerchantId: string;
    operation: string;
    status: "info" | "success" | "error" | "warning" | "retry";
    cloverOrderId: string | null;
    cloverCustomerId: string | null;
    cloverItemId: string | null;
    purchaseReference: string | null;
    ghlContactId: string | null;
    ghlTagName: string | null;
    ghlObjectRecordId: string | null;
    httpMethod: string | null;
    endpoint: string | null;
    httpStatus: number | null;
    durationMs: number | null;
    retryCount: number;
    errorMessage: string | null;
    details: any;
    createdAt: string;
};

// ---- Structured Correlation Logger ------------------------------------

export async function logSyncStep(entry: {
    correlationId: string;
    operation: string;
    status: "info" | "success" | "error" | "warning" | "retry";
    cloverOrderId?: string | null;
    cloverCustomerId?: string | null;
    cloverItemId?: string | null;
    purchaseReference?: string | null;
    ghlContactId?: string | null;
    ghlTagName?: string | null;
    ghlObjectRecordId?: string | null;
    httpMethod?: string | null;
    endpoint?: string | null;
    httpStatus?: number | null;
    durationMs?: number | null;
    retryCount?: number;
    errorMessage?: string | null;
    details?: any;
}) {
    try {
        const sb = getSupabaseServer();
        const cfg = getIntegrationConfig();
        await sb.from("sync_logs").insert({
            correlation_id: entry.correlationId,
            clover_merchant_id: cfg.clover.merchantId,
            operation: entry.operation,
            status: entry.status,
            clover_order_id: entry.cloverOrderId ?? null,
            clover_customer_id: entry.cloverCustomerId ?? null,
            clover_item_id: entry.cloverItemId ?? null,
            purchase_reference: entry.purchaseReference ?? null,
            ghl_contact_id: entry.ghlContactId ?? null,
            ghl_tag_name: entry.ghlTagName ?? null,
            ghl_object_record_id: entry.ghlObjectRecordId ?? null,
            http_method: entry.httpMethod ?? null,
            endpoint: entry.endpoint ?? null,
            http_status: entry.httpStatus ?? null,
            duration_ms: entry.durationMs ?? null,
            retry_count: entry.retryCount ?? 0,
            error_message: entry.errorMessage ?? null,
            details: entry.details ?? null,
        });
    } catch (err) {
        console.error("[logSyncStep] Failed to write sync log:", err);
    }
}

export async function getSyncLogs(limit = 100, correlationId?: string): Promise<SyncLogEntry[]> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();
    let query = sb
        .from("sync_logs")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (correlationId) {
        query = query.eq("correlation_id", correlationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load sync logs: ${error.message}`);

    return (data ?? []).map((row) => ({
        id: row.id,
        correlationId: row.correlation_id,
        cloverMerchantId: row.clover_merchant_id,
        operation: row.operation,
        status: row.status,
        cloverOrderId: row.clover_order_id,
        cloverCustomerId: row.clover_customer_id,
        cloverItemId: row.clover_item_id,
        purchaseReference: row.purchase_reference,
        ghlContactId: row.ghl_contact_id,
        ghlTagName: row.ghl_tag_name,
        ghlObjectRecordId: row.ghl_object_record_id,
        httpMethod: row.http_method,
        endpoint: row.endpoint,
        httpStatus: row.http_status,
        durationMs: row.duration_ms,
        retryCount: row.retry_count ?? 0,
        errorMessage: row.error_message,
        details: row.details,
        createdAt: row.created_at,
    }));
}

// ---- Product Mappings Repository --------------------------------------

export async function getProductMappings(): Promise<ProductMappingRow[]> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    // Load inventory items from the `products` table (populated during ingestion)
    const { data: items, error: iErr } = await sb
        .from("products")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId);

    if (iErr) throw new Error(`Failed to load products: ${iErr.message}`);

    const { data: mappings } = await sb
        .from("product_mappings")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId);

    const mappingMap = new Map((mappings ?? []).map((m) => [m.clover_item_id, m]));

    // Count order items per item_id to show sales frequency
    const { data: itemCounts } = await sb.from("order_items").select("clover_item_id, quantity");

    const purchaseCountMap = new Map<string, number>();
    for (const row of itemCounts ?? []) {
        if (row.clover_item_id) {
            const current = purchaseCountMap.get(row.clover_item_id) ?? 0;
            purchaseCountMap.set(row.clover_item_id, current + (row.quantity || 1));
        }
    }

    const results: ProductMappingRow[] = [];

    for (const item of items ?? []) {
        const existing = mappingMap.get(item.clover_item_id);
        const normName = normalizeItemName(item.name ?? "");
        const tag = purchaseTagLabel(normName);

        results.push({
            id: existing?.id ?? item.id,
            cloverMerchantId: cfg.clover.merchantId,
            cloverItemId: item.clover_item_id,
            itemName: item.name ?? "",
            normalizedItemName: normName,
            categoryId: item.clover_category_id ?? null,
            categoryName: item.category_name ?? null,
            priceCents: item.price_cents ?? 0,
            canonicalProductName: existing?.canonical_product_name ?? normName,
            purchaseTagName: existing?.purchase_tag_name ?? tag,
            ghlMappingStatus: existing?.ghl_mapping_status ?? "ready",
            purchaseCount: purchaseCountMap.get(item.clover_item_id) ?? 0,
            lastSeenAt: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        });
    }

    return results.sort((a, b) => b.purchaseCount - a.purchaseCount);
}

// ---- Customer Purchases Search ("Who Bought Wings?") -------------------

export async function searchCustomerPurchasesByItem(
    searchQuery: string,
): Promise<CustomerPurchaseSearchResult> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();
    const query = searchQuery.trim();

    if (!query) {
        return {
            itemId: null,
            itemName: "None selected",
            canonicalProduct: "None",
            purchaseTag: "Clover - Purchased: None",
            totalBuyers: 0,
            totalQuantity: 0,
            totalSalesCents: 0,
            matchedGhlContactsCount: 0,
            tagsVerifiedCount: 0,
            customObjectsSyncedCount: 0,
            buyers: [],
        };
    }

    // 1. Search order_items matching item_name or clover_item_id
    // Use a direct query (not inner join) to avoid referencing non-existent FK relationships
    const { data: orderItems, error: oiErr } = await sb
        .from("order_items")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .or(`item_name.ilike.%${query}%,clover_item_id.eq.${query}`);

    if (oiErr) {
        throw new Error(`Failed to search order items: ${oiErr.message}`);
    }

    const normName = normalizeItemName(query);
    const tagLabel = purchaseTagLabel(normName);

    if (!orderItems || orderItems.length === 0) {
        return {
            itemId: null,
            itemName: query,
            canonicalProduct: normName,
            purchaseTag: tagLabel,
            totalBuyers: 0,
            totalQuantity: 0,
            totalSalesCents: 0,
            matchedGhlContactsCount: 0,
            tagsVerifiedCount: 0,
            customObjectsSyncedCount: 0,
            buyers: [],
        };
    }

    // Collect distinct order UUIDs to join against orders table
    const orderIds = Array.from(new Set(orderItems.map((oi) => oi.order_id).filter(Boolean)));

    // Fetch linked orders to get customer IDs and timestamps
    const { data: relatedOrders } = orderIds.length > 0
        ? await sb
              .from("orders")
              .select("id, clover_order_id, clover_customer_id, created_time")
              .in("id", orderIds)
        : { data: [] };
    const orderMap = new Map((relatedOrders ?? []).map((o) => [o.id, o]));

    // Collect distinct customer IDs from the orders
    const relatedCustomerIds = Array.from(
        new Set((relatedOrders ?? []).map((o) => o.clover_customer_id).filter(Boolean) as string[]),
    );

    // Load customer profiles
    const { data: relCustomers } = relatedCustomerIds.length > 0
        ? await sb.from("customers").select("*").in("clover_customer_id", relatedCustomerIds)
        : { data: [] };
    const relCustMap = new Map((relCustomers ?? []).map((c) => [c.clover_customer_id, c]));

    // Load customer → GHL contact mappings
    const { data: relMappings } = relatedCustomerIds.length > 0
        ? await sb.from("customer_mappings").select("*").in("clover_customer_id", relatedCustomerIds)
        : { data: [] };
    const relMappingMap = new Map((relMappings ?? []).map((m) => [m.clover_customer_id, m]));

    // Load purchase_tags for tag verification status
    const { data: relTags } = relatedCustomerIds.length > 0
        ? await sb.from("purchase_tags").select("*").in("clover_customer_id", relatedCustomerIds)
        : { data: [] };
    const relTagMap = new Map((relTags ?? []).map((t) => [t.clover_customer_id, t]));

    let totalQty = 0;
    let totalSales = 0;
    const matchedContacts = new Set<string>();
    let verifiedTagsCount = 0;
    let customObjectsSynced = 0;

    const buyersList: CustomerPurchaseSearchResult["buyers"] = [];

    for (const oi of orderItems) {
        const ord = oi.order_id ? orderMap.get(oi.order_id) : null;
        const cid = ord?.clover_customer_id ?? null;
        const cust = cid ? relCustMap.get(cid) : null;
        const mapping = cid ? (relMappingMap.get(cid) as any) : null;
        const tag = cid ? (relTagMap.get(cid) as any) : null;

        const qty = oi.quantity || 1;
        const price = oi.unit_price_cents || 0;
        const lineTotal = oi.line_total_cents || qty * price;

        totalQty += qty;
        totalSales += lineTotal;

        if (mapping?.ghl_contact_id) matchedContacts.add(mapping.ghl_contact_id);
        if (tag?.verification_status === "verified") verifiedTagsCount++;
        if (oi.ghl_record_id) customObjectsSynced++;

        const cName = cust
            ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") || "Clover Customer"
            : cid
                ? `Clover Customer ${cid}`
                : "Anonymous / Walk-in";

        buyersList.push({
            cloverCustomerId: cid,
            customerName: cName,
            phone: cust?.phone ?? null,
            email: cust?.email ?? null,
            cloverOrderId: oi.clover_order_id ?? ord?.clover_order_id ?? "",
            purchaseDate: String(ord?.created_time ?? oi.created_time ?? oi.created_at ?? ""),
            quantity: qty,
            unitPriceCents: price,
            lineTotalCents: lineTotal,
            ghlContactId: mapping?.ghl_contact_id ?? null,
            matchMethod: mapping?.match_method ?? mapping?.matched_by ?? null,
            matchStatus: mapping ? "MATCHED" : cid ? "UNMATCHED" : "NO_CUSTOMER",
            purchaseTag: tagLabel,
            tagStatus: tag?.verification_status ?? "pending",
            customObjectRecordId: oi.ghl_record_id ?? null,
            customObjectStatus: oi.ghl_record_id ? "created" : "pending",
        });
    }

    return {
        itemId: orderItems[0]?.clover_item_id ?? null,
        itemName: orderItems[0]?.item_name ?? query,
        canonicalProduct: normName,
        purchaseTag: tagLabel,
        totalBuyers: relatedCustomerIds.length,
        totalQuantity: totalQty,
        totalSalesCents: totalSales,
        matchedGhlContactsCount: matchedContacts.size,
        tagsVerifiedCount: verifiedTagsCount,
        customObjectsSyncedCount: customObjectsSynced,
        buyers: buyersList.sort(
            (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime(),
        ),
    };
}
