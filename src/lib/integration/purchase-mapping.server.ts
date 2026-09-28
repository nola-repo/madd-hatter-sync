//
// Server-only: item → customer purchase queries + purchase tagging orchestration.
// This is the core of the "Who bought Wings?" feature.
//
// SAFETY: This module NEVER creates GHL contacts. It only matches Clover
// customers to EXISTING GHL contacts via the centralized CustomerMatchService,
// and only tags confidently-matched contacts.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import { normalizeItemName, purchaseTagLabel } from "./ghl-tags.server";
import { applyPurchaseTag, verifyPurchaseTag } from "./ghl-tags.server";
import {
    matchCloverCustomerToGhlContact,
    persistVerifiedMapping,
    recordMatchAudit,
    type MatchResult,
} from "./customer-match.server";
import type { OrderRow, OrderItemRow } from "./supabase.server";

// ---- Types (browser-safe DTOs) ------------------------------------------

export type ItemCustomerRow = {
    cloverCustomerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    cloverOrderId: string;
    cloverItemId: string | null;
    itemName: string;
    category: string | null;
    quantity: number;
    amountSpentCents: number;
    purchaseDate: number;
    paymentStatus: string;
    ghlContactId: string | null;
    matchStatus: string;
    matchMethod: string | null;
    tagStatus: string;
    verificationStatus: string | null;
};

export type ItemSearchResult = {
    itemFound: boolean;
    itemName: string;
    cloverItemId: string | null;
    totalCustomers: number;
    totalQuantity: number;
    totalRevenueCents: number;
    customers: ItemCustomerRow[];
};

export type PurchaseTagResult = {
    cloverCustomerId: string;
    cloverOrderId: string;
    cloverLineItemId: string;
    cloverItemId: string | null;
    itemName: string;
    quantity: number;
    amountCents: number;
    ghlContactId: string | null;
    tag: string;
    status: string;
    matchStatus: string;
    matchReason: string | null;
    verificationStatus: string | null;
    error: string | null;
};

export type PurchaseTagSummary = {
    processed: number;
    tagsApplied: number;
    alreadyTagged: number;
    tagsVerified: number;
    verificationFailed: number;
    unmatched: number;
    needsReview: number;
    conflicts: number;
    skipped: number;
    errors: number;
    results: PurchaseTagResult[];
};

// ---- Item → Customer query ----------------------------------------------

/**
 * Find all customers who purchased a specific item.
 * Prefers exact Clover Item ID; falls back to normalized item name matching.
 * This is a READ-ONLY monitoring query — it does NOT modify GHL.
 */
export async function findCustomersByItem(opts: {
    itemId?: string;
    itemName?: string;
    range?: "today" | "week" | "month" | "all";
}): Promise<ItemSearchResult> {
    const sb = getSupabaseServer();
    const { rangeToMs } = await import("./clover-dates.server");
    const range = rangeToMs(opts.range ?? "all");

    let itemQuery = sb.from("order_items").select("*");
    if (opts.itemId) {
        itemQuery = itemQuery.eq("clover_item_id", opts.itemId);
    }
    const { data: items, error: iErr } = await itemQuery.limit(50000);
    if (iErr) throw new Error(`DB items: ${iErr.message}`);
    const itemRows = (items ?? []) as OrderItemRow[];

    let matchedItems = itemRows;
    let itemName = opts.itemName ?? "";
    let cloverItemId = opts.itemId ?? null;

    if (!opts.itemId && opts.itemName) {
        const normalized = normalizeItemName(opts.itemName).toLowerCase();
        matchedItems = itemRows.filter(
            (i) => normalizeItemName(i.item_name).toLowerCase() === normalized,
        );
        if (matchedItems.length > 0) {
            itemName = matchedItems[0].item_name;
            cloverItemId = matchedItems[0].clover_item_id ?? null;
        }
    } else if (matchedItems.length > 0) {
        itemName = matchedItems[0].item_name;
    }

    if (matchedItems.length === 0) {
        return {
            itemFound: false,
            itemName,
            cloverItemId,
            totalCustomers: 0,
            totalQuantity: 0,
            totalRevenueCents: 0,
            customers: [],
        };
    }

    const orderIds = new Set(matchedItems.map((i) => i.order_id));
    const { data: orders, error: oErr } = await sb
        .from("orders")
        .select("*")
        .in("id", [...orderIds])
        .limit(20000);
    if (oErr) throw new Error(`DB orders: ${oErr.message}`);
    const orderRows = (orders ?? []) as OrderRow[];
    const orderMap = new Map(orderRows.map((o) => [o.id, o]));

    const customerIds = new Set(
        orderRows.map((o) => o.clover_customer_id).filter(Boolean) as string[],
    );
    const { data: customers } = await sb
        .from("customers")
        .select("*")
        .in("clover_customer_id", [...customerIds])
        .limit(5000);
    const customerMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));

    const { data: mappings } = await sb
        .from("customer_mappings")
        .select("*")
        .in("clover_customer_id", [...customerIds]);
    const mappingMap = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id, m]));

    const normalizedItem = normalizeItemName(itemName);
    const { data: existingTags } = await sb
        .from("purchase_tags")
        .select("*")
        .eq("normalized_item_name", normalizedItem)
        .in("clover_customer_id", [...customerIds]);
    const tagMap = new Map((existingTags ?? []).map((t: any) => [t.clover_customer_id, t]));

    const rows: ItemCustomerRow[] = [];
    for (const item of matchedItems) {
        const order = orderMap.get(item.order_id);
        if (!order) continue;
        if (range.startMs > 0 || range.endMs > 0) {
            const ct = order.created_time ?? 0;
            if (ct < range.startMs || ct > range.endMs) continue;
        }
        if (order.voided) continue;

        const custId = order.clover_customer_id;
        const cust = custId ? customerMap.get(custId) : null;
        const mapping = custId ? (mappingMap.get(custId) as any | undefined) : undefined;
        const tag = custId ? tagMap.get(custId) : undefined;

        const matchStatus = !custId
            ? "NO_CUSTOMER"
            : mapping
                ? "MATCHED"
                : cust?.email || cust?.phone
                    ? "NO_GHL_MATCH"
                    : "NO_IDENTIFIERS";

        rows.push({
            cloverCustomerId: custId ?? "",
            customerName: cust
                ? [cust.first_name, cust.last_name].filter(Boolean).join(" ")
                : "Anonymous",
            email: cust?.email ?? null,
            phone: cust?.phone ?? null,
            cloverOrderId: order.clover_order_id,
            cloverItemId: item.clover_item_id,
            itemName: item.item_name,
            category: item.category,
            quantity: item.quantity,
            amountSpentCents: item.line_total_cents,
            purchaseDate: order.created_time,
            paymentStatus: order.payment_status,
            ghlContactId: mapping?.ghl_contact_id ?? null,
            matchStatus,
            matchMethod: mapping?.match_method ?? mapping?.matched_by ?? null,
            tagStatus: tag?.status ?? "not_tagged",
            verificationStatus: tag?.verification_status ?? null,
        });
    }

    const uniqueCustomers = new Map<string, ItemCustomerRow>();
    for (const r of rows) {
        if (!r.cloverCustomerId) continue;
        const existing = uniqueCustomers.get(r.cloverCustomerId);
        if (!existing || r.purchaseDate > existing.purchaseDate) {
            uniqueCustomers.set(r.cloverCustomerId, r);
        }
    }

    const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.amountSpentCents, 0);

    return {
        itemFound: true,
        itemName,
        cloverItemId,
        totalCustomers: uniqueCustomers.size,
        totalQuantity,
        totalRevenueCents: totalRevenue,
        customers: rows.sort((a, b) => b.purchaseDate - a.purchaseDate),
    };
}

// ---- Purchase tagging orchestration -------------------------------------

/**
 * Apply purchase tags for all line items of a specific item.
 *
 * SAFETY PIPELINE (per customer):
 *   1. Resolve Clover customer → EXISTING GHL contact via CustomerMatchService.
 *   2. If NOT a confident match → DO NOT modify GHL. Record status. Continue.
 *   3. If confident match → check existing tag (idempotent).
 *   4. Apply "Purchased: <Item>" tag.
 *   5. VERIFY the tag actually exists on the GHL contact.
 *   6. Record result in purchase_tags + match_audit_log.
 *
 * NEVER creates GHL contacts.
 * NEVER tags based on name-only or conflicting evidence.
 */
export async function tagCustomersByItem(opts: {
    itemId?: string;
    itemName?: string;
    range?: "today" | "week" | "month" | "all";
}): Promise<PurchaseTagSummary> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    const search = await findCustomersByItem(opts);
    if (!search.itemFound || search.customers.length === 0) {
        return {
            processed: 0,
            tagsApplied: 0,
            alreadyTagged: 0,
            tagsVerified: 0,
            verificationFailed: 0,
            unmatched: 0,
            needsReview: 0,
            conflicts: 0,
            skipped: 0,
            errors: 0,
            results: [],
        };
    }

    const results: PurchaseTagResult[] = [];
    let tagsApplied = 0;
    let alreadyTagged = 0;
    let tagsVerified = 0;
    let verificationFailed = 0;
    let unmatched = 0;
    let needsReview = 0;
    let conflicts = 0;
    let skipped = 0;
    let errors = 0;
    const normalizedItem = normalizeItemName(search.itemName);
    const tag = purchaseTagLabel(search.itemName);

    // Group by customer so we only resolve + tag once per customer.
    const byCustomer = new Map<string, ItemCustomerRow[]>();
    for (const c of search.customers) {
        if (!c.cloverCustomerId) {
            skipped++;
            results.push({
                cloverCustomerId: "",
                cloverOrderId: c.cloverOrderId,
                cloverLineItemId: "",
                cloverItemId: c.cloverItemId,
                itemName: c.itemName,
                quantity: c.quantity,
                amountCents: c.amountSpentCents,
                ghlContactId: null,
                tag,
                status: "NO_CUSTOMER",
                matchStatus: "NO_CUSTOMER",
                matchReason: "No customer attached to this order",
                verificationStatus: null,
                error: "No customer attached to this order",
            });
            continue;
        }
        if (c.paymentStatus === "REFUNDED") {
            skipped++;
            results.push({
                cloverCustomerId: c.cloverCustomerId,
                cloverOrderId: c.cloverOrderId,
                cloverLineItemId: "",
                cloverItemId: c.cloverItemId,
                itemName: c.itemName,
                quantity: c.quantity,
                amountCents: c.amountSpentCents,
                ghlContactId: null,
                tag,
                status: "SKIPPED_REFUNDED",
                matchStatus: "SKIPPED",
                matchReason: "Order was refunded",
                verificationStatus: null,
                error: "Order was refunded — tag not applied",
            });
            continue;
        }
        const arr = byCustomer.get(c.cloverCustomerId) ?? [];
        arr.push(c);
        byCustomer.set(c.cloverCustomerId, arr);
    }

    // Fetch customer records for identity resolution.
    const customerIds = [...byCustomer.keys()];
    const { data: customerRecs } = await sb
        .from("customers")
        .select("*")
        .in("clover_customer_id", customerIds)
        .limit(5000);
    const customerRecMap = new Map((customerRecs ?? []).map((c: any) => [c.clover_customer_id, c]));

    // Check existing tags in DB.
    const { data: existingTags } = await sb
        .from("purchase_tags")
        .select("*")
        .eq("normalized_item_name", normalizedItem)
        .in("clover_customer_id", customerIds);
    const existingTagMap = new Map((existingTags ?? []).map((t: any) => [t.clover_customer_id, t]));

    for (const [cloverCustomerId, purchases] of byCustomer) {
        const customer = customerRecMap.get(cloverCustomerId);
        const latest = purchases.sort((a, b) => b.purchaseDate - a.purchaseDate)[0];
        const totalQty = purchases.reduce((s, p) => s + p.quantity, 0);
        const totalAmt = purchases.reduce((s, p) => s + p.amountSpentCents, 0);

        // Check if already tagged + verified in our DB.
        const existingTag = existingTagMap.get(cloverCustomerId);
        if (
            existingTag &&
            existingTag.status === "applied" &&
            existingTag.verification_status === "verified"
        ) {
            alreadyTagged++;
            results.push({
                cloverCustomerId,
                cloverOrderId: latest.cloverOrderId,
                cloverLineItemId: "",
                cloverItemId: latest.cloverItemId,
                itemName: search.itemName,
                quantity: totalQty,
                amountCents: totalAmt,
                ghlContactId: existingTag.ghl_contact_id ?? null,
                tag,
                status: "ALREADY_TAGGED",
                matchStatus: "MATCHED",
                matchReason: "Previously verified",
                verificationStatus: "verified",
                error: null,
            });
            continue;
        }

        // ---- CENTRALIZED IDENTITY RESOLUTION ----
        const match: MatchResult = await matchCloverCustomerToGhlContact({
            cloverCustomerId,
            customerName: customer
                ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
                : null,
            customerEmail: customer?.email ?? null,
            customerPhone: customer?.phone ?? null,
        });

        // If NOT a confident match → DO NOT modify GHL.
        if (!match.confident || !match.ghlContactId) {
            const statusLabel = match.status;
            if (match.status === "NO_MATCH" || match.status === "NO_IDENTIFIERS") unmatched++;
            else if (match.status === "CONFLICT") conflicts++;
            else if (match.status === "AMBIGUOUS_MATCH" || match.status === "NEEDS_REVIEW") needsReview++;

            // Record the non-action in the audit log.
            await recordMatchAudit({
                cloverCustomerId,
                cloverOrderId: latest.cloverOrderId,
                cloverItemId: latest.cloverItemId,
                match,
                expectedTag: tag,
                tagStatus: "not_applicable",
            });

            // Update the order's mapping status for display.
            await sb
                .from("orders")
                .update({ mapping_status: statusLabel, match_method: match.matchMethod })
                .eq("clover_customer_id", cloverCustomerId)
                .eq("clover_merchant_id", cfg.clover.merchantId);

            results.push({
                cloverCustomerId,
                cloverOrderId: latest.cloverOrderId,
                cloverLineItemId: "",
                cloverItemId: latest.cloverItemId,
                itemName: search.itemName,
                quantity: totalQty,
                amountCents: totalAmt,
                ghlContactId: null,
                tag,
                status: statusLabel,
                matchStatus: statusLabel,
                matchReason: match.reason,
                verificationStatus: null,
                error: null,
            });
            continue;
        }

        // ---- CONFIDENT MATCH: persist mapping + apply tag ----
        await persistVerifiedMapping(
            cloverCustomerId,
            match.ghlContactId,
            match.matchMethod,
            match.evidence.cloverEmail,
            match.evidence.cloverPhone,
        );

        // Apply the tag (idempotent).
        const tagResult = await applyPurchaseTag(match.ghlContactId, search.itemName);
        if (tagResult.status === "error") {
            errors++;
            await recordMatchAudit({
                cloverCustomerId,
                cloverOrderId: latest.cloverOrderId,
                cloverItemId: latest.cloverItemId,
                match,
                expectedTag: tag,
                tagStatus: "failed",
                errorMessage: tagResult.error,
            });
            await sb.from("purchase_tags").upsert(
                {
                    clover_merchant_id: cfg.clover.merchantId,
                    clover_customer_id: cloverCustomerId,
                    ghl_contact_id: match.ghlContactId,
                    normalized_item_name: normalizedItem,
                    tag_label: tag,
                    clover_item_id: latest.cloverItemId,
                    status: "error",
                    verification_status: "failed",
                    error: tagResult.error,
                    match_method: match.matchMethod,
                },
                { onConflict: "clover_customer_id,normalized_item_name" },
            );
            results.push({
                cloverCustomerId,
                cloverOrderId: latest.cloverOrderId,
                cloverLineItemId: "",
                cloverItemId: latest.cloverItemId,
                itemName: search.itemName,
                quantity: totalQty,
                amountCents: totalAmt,
                ghlContactId: match.ghlContactId,
                tag,
                status: "TAG_FAILED",
                matchStatus: match.status,
                matchReason: match.reason,
                verificationStatus: "failed",
                error: tagResult.error ?? "Tag application failed",
            });
            continue;
        }

        if (tagResult.status === "applied") tagsApplied++;
        else if (tagResult.status === "already_tagged") alreadyTagged++;

        // ---- VERIFY the tag actually exists on the GHL contact ----
        const verification = await verifyPurchaseTag(match.ghlContactId, search.itemName);
        if (verification.verified) {
            tagsVerified++;
        } else {
            verificationFailed++;
        }

        const verificationStatus = verification.status; // verified | failed | out_of_sync

        // Record the verified tag in our DB (idempotent).
        await sb.from("purchase_tags").upsert(
            {
                clover_merchant_id: cfg.clover.merchantId,
                clover_customer_id: cloverCustomerId,
                ghl_contact_id: match.ghlContactId,
                normalized_item_name: normalizedItem,
                tag_label: tag,
                clover_item_id: latest.cloverItemId,
                status: "applied",
                verification_status: verificationStatus,
                verified_at: verification.verified ? new Date().toISOString() : null,
                error: verification.error,
                match_method: match.matchMethod,
            },
            { onConflict: "clover_customer_id,normalized_item_name" },
        );

        // Audit log.
        await recordMatchAudit({
            cloverCustomerId,
            cloverOrderId: latest.cloverOrderId,
            cloverItemId: latest.cloverItemId,
            match,
            expectedTag: tag,
            tagStatus: verificationStatus,
            errorMessage: verification.error,
        });

        // Update order mapping status.
        await sb
            .from("orders")
            .update({
                mapping_status: "MATCHED",
                match_method: match.matchMethod,
                ghl_contact_id: match.ghlContactId,
                processed_at: new Date().toISOString(),
            })
            .eq("clover_customer_id", cloverCustomerId)
            .eq("clover_merchant_id", cfg.clover.merchantId);

        results.push({
            cloverCustomerId,
            cloverOrderId: latest.cloverOrderId,
            cloverLineItemId: "",
            cloverItemId: latest.cloverItemId,
            itemName: search.itemName,
            quantity: totalQty,
            amountCents: totalAmt,
            ghlContactId: match.ghlContactId,
            tag,
            status: tagResult.status === "applied" ? "TAG_APPLIED" : "ALREADY_TAGGED",
            matchStatus: match.status,
            matchReason: match.reason,
            verificationStatus,
            error: null,
        });
    }

    return {
        processed: results.length,
        tagsApplied,
        alreadyTagged,
        tagsVerified,
        verificationFailed,
        unmatched,
        needsReview,
        conflicts,
        skipped,
        errors,
        results,
    };
}

/**
 * Get a customer's full purchase history from synced Clover data.
 */
export async function getCustomerPurchaseHistory(cloverCustomerId: string): Promise<
    Array<{
        cloverOrderId: string;
        cloverLineItemId: string;
        cloverItemId: string | null;
        itemName: string;
        category: string | null;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        purchaseDate: number;
        paymentStatus: string;
    }>
> {
    const sb = getSupabaseServer();
    const { data: orders, error: oErr } = await sb
        .from("orders")
        .select("id,clover_order_id,created_time,payment_status,voided")
        .eq("clover_customer_id", cloverCustomerId)
        .order("created_time", { ascending: false })
        .limit(500);
    if (oErr) throw new Error(`DB history orders: ${oErr.message}`);

    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) return [];

    const { data: items, error: iErr } = await sb
        .from("order_items")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
    if (iErr) throw new Error(`DB history items: ${iErr.message}`);

    const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
    return (items ?? []).map((i: any) => {
        const o = orderMap.get(i.order_id);
        return {
            cloverOrderId: o?.clover_order_id ?? "",
            cloverLineItemId: i.clover_line_item_id,
            cloverItemId: i.clover_item_id,
            itemName: i.item_name,
            category: i.category,
            quantity: i.quantity,
            unitPriceCents: i.unit_price_cents,
            lineTotalCents: i.line_total_cents,
            purchaseDate: o?.created_time ?? 0,
            paymentStatus: o?.payment_status ?? "",
        };
    });
}
