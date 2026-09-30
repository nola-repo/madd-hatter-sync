//
// Server-only sync orchestration: idempotent, concurrency-safe, step-by-step.
//
// SAFETY: This module uses the centralized CustomerMatchService and NEVER
// creates GHL contacts for unmatched Clover customers. Only confidently
// matched EXISTING GHL contacts receive purchase records + tags.
import { fetchCloverOrder } from "./clover.server";
import {
    associateRecordToContact,
    createGhlContact,
    createPurchaseRecord,
    findPurchaseObjectSchema,
    findRecordByPurchaseReference,
    validatePurchaseSchema,
    type CustomObjectSchema,
    type SchemaValidation,
} from "./ghl.server";

import { assessOrderEligibility, purchaseReference } from "./matching.server";
import {
    matchCloverCustomerToGhlContact,
    persistVerifiedMapping,
    recordMatchAudit,
} from "./customer-match.server";
import {
    applyPurchaseTag,
    verifyPurchaseTag,
    normalizeItemName,
    purchaseTagLabel,
} from "./ghl-tags.server";
import { logSyncStep } from "./product-mapping.server";
import {
    createSyncAttempt,
    finishSyncAttempt,
    getOrder,
    getOrderItems,
    getSupabaseServer,
    nextAttemptNumber,
    tryAcquireOrderLock,
    updateOrder,
    upsertOrder,
    upsertOrderItem,
} from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import type { CloverOrder, SyncResult } from "./types";

export async function syncOrderToGhl(
    orderId: string,
    cached?: { schema: CustomObjectSchema | null; schemaVal: SchemaValidation },
): Promise<SyncResult> {

    const cfg = getIntegrationConfig();
    const merchantId = cfg.clover.merchantId;

    // 1. Fetch from Clover (source of truth).
    const order = await fetchCloverOrder(orderId);
    if (order.merchantId !== merchantId) {
        return {
            outcome: "error",
            message: "Order merchant does not match configured merchant.",
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: 0,
            reviewReason: null,
            error: `Order merchant ${order.merchantId} != configured ${merchantId}.`,
        };
    }

    // 2. Upsert order row + acquire lock.
    let orderRow = await getOrder(merchantId, orderId);
    if (!orderRow) {
        orderRow = await upsertOrder({
            clover_merchant_id: merchantId,
            clover_order_id: orderId,
            clover_customer_id: order.customer?.id ?? null,
            status: "pending",
            payment_status: order.paymentStatus,
            currency: order.currency,
            total_cents: order.total.cents,
            created_time: order.createdTime,
            location_name: order.locationName,
            review_reason: null,
            last_attempt_id: null,
        });
    } else {
        // refresh mutable fields
        await updateOrder(orderRow.id, {
            payment_status: order.paymentStatus,
            currency: order.currency,
            total_cents: order.total.cents,
            created_time: order.createdTime,
            location_name: order.locationName,
            clover_customer_id: order.customer?.id ?? null,
        });
    }

    const locked = await tryAcquireOrderLock(orderRow.id);
    if (!locked) {
        return {
            outcome: "skipped",
            message: "This order is already being processed. Try again in a moment.",
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: 0,
            reviewReason: null,
            error: null,
        };
    }

    const attemptNum = await nextAttemptNumber(orderRow.id);
    const attempt = await createSyncAttempt(orderRow.id, attemptNum);

    try {
        const result = await runSync(order, orderRow.id, cached);

        await finishSyncAttempt(attempt.id, {
            status: result.outcome,
            outcome_message: result.message,
            ghl_contact_id: result.ghlContactId,
            matched_by: result.matchedBy,
            items_synced: result.itemsSynced,
            items_held: result.itemsHeld,
            error: result.error,
            review_reason: result.reviewReason,
        });
        await updateOrder(orderRow.id, {
            status:
                result.outcome === "synced"
                    ? "synced"
                    : result.outcome === "partial"
                        ? "synced"
                        : result.outcome === "held_for_review"
                            ? "held_for_review"
                            : result.outcome === "error"
                                ? "error"
                                : "synced",
            ghl_contact_id: result.ghlContactId,
            review_reason: result.reviewReason,
            last_attempt_id: attempt.id,
        });
        return result;
    } catch (e: any) {
        const msg = e?.message ?? String(e);
        await finishSyncAttempt(attempt.id, {
            status: "error",
            error: msg,
        });
        await updateOrder(orderRow.id, {
            status: "error",
            review_reason: msg,
            last_attempt_id: attempt.id,
        });
        return {
            outcome: "error",
            message: "Sync failed before completion. Progress was saved; you can retry safely.",
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: 0,
            reviewReason: null,
            error: msg,
        };
    }
}

async function runSync(
    order: CloverOrder,
    orderRowId: string,
    cached?: { schema: CustomObjectSchema | null; schemaVal: SchemaValidation },
): Promise<SyncResult> {
    const cfg = getIntegrationConfig();
    const orderElig = assessOrderEligibility(order);

    // Schema: use cached value from batch run if available, otherwise fetch fresh.
    // This avoids probing 5 GHL endpoints per order during batch sync (RC-7 fix).
    let schema: CustomObjectSchema | null;
    let schemaVal: SchemaValidation;
    if (cached) {
        schema = cached.schema;
        schemaVal = cached.schemaVal;
    } else {
        const discovered = await findPurchaseObjectSchema();
        schema = discovered.schema;
        schemaVal = validatePurchaseSchema(schema);
    }

    // Only block if the schema object itself doesn't exist, OR if the
    // Purchase Reference field is absent (it's the dedup key — without it
    // we can't prevent duplicate records). Any other missing fields are
    // tolerated: the record is created with whatever fields exist.
    const purchaseRefKey = schemaVal.fieldKeyMap["Purchase Reference"];
    if (!schema || !purchaseRefKey) {
        return {
            outcome: "error",
            message: !schema
                ? "GHL 'POS Purchase Item' custom object not found. Create it in GHL Settings → Custom Objects."
                : "GHL custom object is missing the required 'Purchase Reference' field (used for deduplication).",
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: 0,
            reviewReason: null,
            error: !schema
                ? "Custom object schema not found in GHL."
                : "Missing 'Purchase Reference' field in GHL custom object.",
        };
    }
    if (schemaVal.missingFields.length > 0) {
        console.warn(
            `[sync] GHL schema partial: missing fields [${schemaVal.missingFields.join(", ")}]. ` +
            `Sync will proceed with available fields.`,
        );
    }

    // ---- CENTRALIZED IDENTITY RESOLUTION ----
    // Uses the canonical CustomerMatchService. NEVER creates contacts.
    const match = await matchCloverCustomerToGhlContact({
        cloverCustomerId: order.customer?.id ?? null,
        customerName: order.customer
            ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ")
            : null,
        customerEmail: order.customer?.email ?? null,
        customerPhone: order.customer?.phone ?? null,
    });

    // Record the match decision in the audit log.
    await recordMatchAudit({
        cloverCustomerId: order.customer?.id ?? null,
        cloverOrderId: order.id,
        match,
        tagStatus: match.confident ? "pending" : "not_applicable",
    });

    await logSyncStep({
        correlationId: `SYNC-${order.id}`,
        operation: "GHL_CONTACT_LOOKUP",
        status: match.confident ? "success" : "warning",
        cloverOrderId: order.id,
        cloverCustomerId: order.customer?.id ?? null,
        ghlContactId: match.ghlContactId ?? null,
        details: { matchStatus: match.status, method: match.matchMethod, reason: match.reason },
    });

    // Update the order row with the mapping status for display.
    await updateOrder(orderRowId, {
        mapping_status: match.status,
        match_method: match.matchMethod,
        review_reason: match.reason,
    });

    // If NOT a confident match — handle NO_CUSTOMER separately by auto-creating
    // an anonymous GHL contact so POS Purchase Items still sync.
    // All other non-confident statuses (CONFLICT, AMBIGUOUS, etc.) stay held.
    if (!match.confident || !match.ghlContactId) {
        if (match.status === "NO_CUSTOMER") {
            // Anonymous walk-in order: auto-create a GHL contact using the order
            // data so POS Purchase Items can still be recorded in GHL.
            let anonymousContactId: string | null = null;
            try {
                const orderDate = new Date(order.createdTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                });
                const shortOrderId = order.id.slice(-6).toUpperCase();
                const created = await createGhlContact({
                    firstName: "Walk-In",
                    lastName: `Customer ${shortOrderId}`,
                    email: "",
                    phone: "",
                    note: `Anonymous walk-in order from Clover POS. Order ID: ${order.id}. Date: ${orderDate}. Total: ${formatMoney(order.total.cents)} ${order.currency}. Location: ${order.locationName ?? "Madd Hatter"}.`,
                });
                anonymousContactId = created.id;
                await logSyncStep({
                    correlationId: `SYNC-${order.id}`,
                    operation: "GHL_CONTACT_LOOKUP",
                    status: "success",
                    cloverOrderId: order.id,
                    cloverCustomerId: null,
                    ghlContactId: anonymousContactId,
                    details: { matchStatus: "AUTO_CREATED_ANONYMOUS", method: "auto_create", reason: `No customer on order. Created anonymous contact Walk-In Customer ${shortOrderId}.` },
                });
            } catch (createErr: any) {
                return {
                    outcome: "error",
                    message: `No customer on order and anonymous contact creation failed: ${createErr?.message ?? "unknown"}.`,
                    ghlContactId: null,
                    matchedBy: null,
                    purchaseRecordIds: [],
                    itemsSynced: 0,
                    itemsHeld: order.lineItems.length,
                    reviewReason: "Anonymous contact creation failed.",
                    error: createErr?.message ?? "unknown",
                };
            }

            // Proceed with the anonymous contact — fall through to line-item sync.
            // We re-assign the match variables so the rest of the function works.
            const anonGhlContactId = anonymousContactId!;
            const anonMatchedBy = "auto_create" as const;

            // Eligibility gate.
            if (!orderElig.eligible) {
                await updateOrder(orderRowId, { ghl_contact_id: anonGhlContactId, review_reason: orderElig.flag });
                return {
                    outcome: "held_for_review",
                    message: `Anonymous contact created, but order is not eligible to sync: ${orderElig.flag}`,
                    ghlContactId: anonGhlContactId,
                    matchedBy: anonMatchedBy,
                    purchaseRecordIds: [],
                    itemsSynced: 0,
                    itemsHeld: order.lineItems.length,
                    reviewReason: orderElig.flag,
                    error: null,
                };
            }

            // Sync line items to the anonymous contact.
            const anonPurchaseRecordIds: string[] = [];
            let anonItemsSynced = 0;
            for (const li of order.lineItems) {
                const ref = purchaseReference(order.merchantId, order.id, li.id);
                let recordId: string | null = null;
                const existingItems = await getOrderItems(orderRowId);
                const existingLocal = existingItems.find((i) => i.purchase_reference === ref && i.ghl_record_id);
                if (existingLocal) recordId = existingLocal.ghl_record_id;
                if (!recordId) {
                    const values: Record<string, string> = {
                        "Purchase Reference": ref,
                        "Item Name": li.name,
                        Category: li.category ?? "",
                        Quantity: String(li.quantity),
                        "Unit Price": formatMoney(li.price.cents),
                        "Line Total": formatMoney(li.discountAmount.cents ? li.price.cents * li.quantity - li.discountAmount.cents : li.price.cents * li.quantity),
                        Currency: order.currency,
                        "Purchase Date": new Date(order.createdTime).toISOString(),
                        "Clover Order ID": order.id,
                        "Clover Line Item ID": li.id,
                        "Clover Item ID": li.cloverItemId ?? "",
                        "Clover Merchant ID": order.merchantId,
                        "Clover Customer ID": "",
                        "Location Name": order.locationName ?? "",
                        "Payment Status": order.paymentStatus,
                    };
                    recordId = await createPurchaseRecord(schema.id, schemaVal.fieldKeyMap, values);
                }
                await associateRecordToContact(schema.id, recordId, anonGhlContactId);
                await upsertOrderItem({
                    order_id: orderRowId,
                    clover_line_item_id: li.id,
                    clover_item_id: li.cloverItemId,
                    purchase_reference: ref,
                    ghl_record_id: recordId,
                    item_name: li.name,
                    category: li.category,
                    quantity: li.quantity,
                    unit_price_cents: li.price.cents,
                    line_total_cents: li.discountAmount.cents ? Math.max(0, li.price.cents * li.quantity - li.discountAmount.cents) : li.price.cents * li.quantity,
                    currency: order.currency,
                    payment_status: order.paymentStatus,
                    status: "synced",
                    flag: "anonymous_walk_in",
                });
                anonPurchaseRecordIds.push(recordId);
                anonItemsSynced += 1;
            }
            await updateOrder(orderRowId, { ghl_contact_id: anonGhlContactId, processed_at: new Date().toISOString() });
            return {
                outcome: "synced",
                message: `Synced ${anonItemsSynced} purchase record(s) to anonymous GHL contact ${anonGhlContactId}.`,
                ghlContactId: anonGhlContactId,
                matchedBy: anonMatchedBy,
                purchaseRecordIds: anonPurchaseRecordIds,
                itemsSynced: anonItemsSynced,
                itemsHeld: 0,
                reviewReason: null,
                error: null,
            };
        }

        // Non-anonymous non-confident matches (CONFLICT, AMBIGUOUS, etc.) → hold.
        return {
            outcome: "held_for_review",
            message: `Customer not confidently matched (${match.status}). No GHL contact or records created. ${match.reason}`,
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: order.lineItems.length,
            reviewReason: match.reason,
            error: null,
        };
    }

    const ghlContactId = match.ghlContactId;
    const matchedBy = match.matchMethod;

    // Persist the verified mapping for future purchases.
    if (order.customer?.id) {
        await persistVerifiedMapping(
            order.customer.id,
            ghlContactId,
            match.matchMethod,
            match.evidence.cloverEmail,
            match.evidence.cloverPhone,
        );
    }

    // Eligibility gate.
    if (!orderElig.eligible) {
        await updateOrder(orderRowId, { ghl_contact_id: ghlContactId, review_reason: orderElig.flag });
        return {
            outcome: "held_for_review",
            message: `Contact resolved, but order is not eligible to sync: ${orderElig.flag}`,
            ghlContactId,
            matchedBy,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: order.lineItems.length,
            reviewReason: orderElig.flag,
            error: null,
        };
    }

    // Create one record per line item, idempotently.
    const purchaseRecordIds: string[] = [];
    let itemsSynced = 0;
    let itemsHeld = 0;
    // purchaseRefKey is declared above in the schema validation block.

    for (const li of order.lineItems) {
        const ref = purchaseReference(order.merchantId, order.id, li.id);

        // check our local DB first for existing record ID (fast, 1 query)
        let recordId: string | null = null;
        const existingItems = await getOrderItems(orderRowId);
        const existingLocal = existingItems.find((i) => i.purchase_reference === ref && i.ghl_record_id);
        if (existingLocal) recordId = existingLocal.ghl_record_id;

        // Do NOT perform expensive multi-page CRM scans per line-item inside cron.
        // If not in local DB, create a new record directly with deterministic reference.

        if (!recordId) {
            const values: Record<string, string> = {
                "Purchase Reference": ref,
                "Item Name": li.name,
                Category: li.category ?? "",
                Quantity: String(li.quantity),
                "Unit Price": formatMoney(li.price.cents),
                "Line Total": formatMoney(
                    li.discountAmount.cents
                        ? li.price.cents * li.quantity - li.discountAmount.cents
                        : li.price.cents * li.quantity,
                ),
                Currency: order.currency,
                "Purchase Date": new Date(order.createdTime).toISOString(),
                "Clover Order ID": order.id,
                "Clover Line Item ID": li.id,
                "Clover Item ID": li.cloverItemId ?? "",
                "Clover Merchant ID": order.merchantId,
                "Clover Customer ID": order.customer?.id ?? "",
                "Location Name": order.locationName ?? "",
                "Payment Status": order.paymentStatus,
            };
            recordId = await createPurchaseRecord(schema.id, schemaVal.fieldKeyMap, values);
        }

        // Associate with the contact (idempotent: re-associating is safe).
        await associateRecordToContact(schema.id, recordId, ghlContactId);

        await logSyncStep({
            correlationId: `SYNC-${order.id}`,
            operation: "GHL_OBJECT_CREATE",
            status: "success",
            cloverOrderId: order.id,
            cloverCustomerId: order.customer?.id ?? null,
            cloverItemId: li.cloverItemId ?? null,
            purchaseReference: ref,
            ghlContactId,
            ghlObjectRecordId: recordId,
            details: { itemName: li.name },
        });

        // ---- Apply + verify the purchase tag on the GHL contact ----
        // This is the primary requirement: "Clover - Purchased: <Item>".
        // Idempotent: skips if already tagged. Never removes other tags.
        // A successful POST is NOT sufficient — we re-read and verify.
        const tagResult = await applyPurchaseTag(ghlContactId, li.name);
        let verificationStatus: "verified" | "failed" | "out_of_sync" = "failed";
        if (tagResult.status === "applied" || tagResult.status === "already_tagged") {
            const verify = await verifyPurchaseTag(ghlContactId, li.name);
            verificationStatus = verify.status;
        }

        await logSyncStep({
            correlationId: `SYNC-${order.id}`,
            operation: "GHL_TAG_VERIFIED",
            status: verificationStatus === "verified" ? "success" : "warning",
            cloverOrderId: order.id,
            cloverCustomerId: order.customer?.id ?? null,
            ghlContactId,
            ghlTagName: purchaseTagLabel(li.name),
            details: { tagStatus: tagResult.status, verificationStatus },
        });

        // Record the tag result in purchase_tags (idempotent upsert by
        // clover_customer_id + normalized_item_name).
        const normalizedItem = normalizeItemName(li.name);
        const tagLabel = purchaseTagLabel(li.name);
        const sb = getSupabaseServer();
        try {
            const { data: existing } = await sb
                .from("purchase_tags")
                .select("id, attempt_count")
                .eq("clover_customer_id", order.customer?.id ?? "")
                .eq("normalized_item_name", normalizedItem)
                .maybeSingle();
            if (existing) {
                await sb
                    .from("purchase_tags")
                    .update({
                        ghl_contact_id: ghlContactId,
                        tag_label: tagLabel,
                        clover_item_id: li.cloverItemId,
                        status: tagResult.status === "error" ? "error" : "applied",
                        verification_status: verificationStatus,
                        verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
                        attempt_count: (existing.attempt_count ?? 0) + 1,
                        last_attempt_at: new Date().toISOString(),
                        error: tagResult.error,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", existing.id);
            } else {
                await sb.from("purchase_tags").insert({
                    clover_merchant_id: order.merchantId,
                    clover_customer_id: order.customer?.id ?? "",
                    ghl_contact_id: ghlContactId,
                    normalized_item_name: normalizedItem,
                    tag_label: tagLabel,
                    clover_item_id: li.cloverItemId,
                    status: tagResult.status === "error" ? "error" : "applied",
                    verification_status: verificationStatus,
                    verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
                    attempt_count: 1,
                    last_attempt_at: new Date().toISOString(),
                    error: tagResult.error,
                });
            }
        } catch {
            // Tag tracking is best-effort; the GHL tag itself is the source of truth.
        }

        // Save progress after each successful step.
        await upsertOrderItem({
            order_id: orderRowId,
            clover_line_item_id: li.id,
            clover_item_id: li.cloverItemId,
            purchase_reference: ref,
            ghl_record_id: recordId,
            item_name: li.name,
            category: li.category,
            quantity: li.quantity,
            unit_price_cents: li.price.cents,
            line_total_cents: li.discountAmount.cents
                ? Math.max(0, li.price.cents * li.quantity - li.discountAmount.cents)
                : li.price.cents * li.quantity,
            currency: order.currency,
            payment_status: order.paymentStatus,
            status: "synced",
            flag: null,
        });
        purchaseRecordIds.push(recordId);
        itemsSynced += 1;
    }

    // Mark the order as processed by the purchase-mapping pipeline.
    await updateOrder(orderRowId, {
        processed_at: new Date().toISOString(),
    });

    return {
        outcome: itemsHeld > 0 ? "partial" : "synced",
        message: `Synced ${itemsSynced} purchase record(s) to GHL contact ${ghlContactId}.`,
        ghlContactId,
        matchedBy,
        purchaseRecordIds,
        itemsSynced,
        itemsHeld,
        reviewReason: null,
        error: null,
    };
}

function formatMoney(cents: number): string {
    return (cents / 100).toFixed(2);
}
