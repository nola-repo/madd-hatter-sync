//
// Server-only sync orchestration: idempotent, concurrency-safe, step-by-step.
//
// SAFETY: This module uses the centralized CustomerMatchService and NEVER
// creates GHL contacts for unmatched Clover customers. Only confidently
// matched EXISTING GHL contacts receive purchase records + tags.
import { fetchCloverOrder } from "./clover.server";
import {
    associateRecordToContact,
    createPurchaseRecord,
    findPurchaseObjectSchema,
    findRecordByPurchaseReference,
    validatePurchaseSchema,
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

export async function syncOrderToGhl(orderId: string): Promise<SyncResult> {
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
        const result = await runSync(order, orderRow.id);
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

async function runSync(order: CloverOrder, orderRowId: string): Promise<SyncResult> {
    const cfg = getIntegrationConfig();
    const orderElig = assessOrderEligibility(order);

    // Schema must be valid before writing any records.
    const schema = await findPurchaseObjectSchema();
    const schemaVal = validatePurchaseSchema(schema);
    if (!schemaVal.ok || !schema) {
        return {
            outcome: "error",
            message: "GHL 'POS Purchase Item' custom object schema is missing or incomplete.",
            ghlContactId: null,
            matchedBy: null,
            purchaseRecordIds: [],
            itemsSynced: 0,
            itemsHeld: 0,
            reviewReason: null,
            error: `Missing GHL custom object fields: ${schemaVal.missingFields.join(", ")}. Create them in GHL under the custom object named "POS Purchase Item".`,
        };
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

    // If NOT a confident match → preserve as unmatched, no GHL modification.
    if (!match.confident || !match.ghlContactId) {
        return {
            outcome: match.status === "NO_CUSTOMER" ? "held_for_review" : "held_for_review",
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
    const purchaseRefKey = schemaVal.fieldKeyMap["Purchase Reference"];

    for (const li of order.lineItems) {
        const ref = purchaseReference(order.merchantId, order.id, li.id);

        // Reconcile: if a record already exists (from a prior timed-out attempt),
        // reuse it instead of creating a duplicate.
        let recordId: string | null = null;
        try {
            recordId = await findRecordByPurchaseReference(schema.id, purchaseRefKey, ref);
        } catch {
            // Search may not be supported; fall through to create and rely on upsert.
            recordId = null;
        }

        // Also check our own DB for a previously-saved record id.
        if (!recordId) {
            const existingItems = await getOrderItems(orderRowId);
            const existing = existingItems.find((i) => i.purchase_reference === ref && i.ghl_record_id);
            if (existing) recordId = existing.ghl_record_id;
        }

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
