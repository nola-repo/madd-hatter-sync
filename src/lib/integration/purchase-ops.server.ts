//
// Server-only: batch processing of pending customer purchase mappings & tag applications.
// Idempotent, concurrency-safe, and self-verifying.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
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
import { syncOrderToGhl } from "./sync.server";

export type ProcessPendingResult = {
    processed: number;
    matched: number;
    unmatched: number;
    needsReview: number;
    conflicts: number;
    tagsApplied: number;
    tagsVerified: number;
    tagsFailed: number;
    errors: number;
    details: Array<{
        cloverCustomerId: string;
        customerName: string;
        status: string;
        ghlContactId: string | null;
        tagsProcessed: number;
        error: string | null;
    }>;
};

/**
 * Process all Clover customers with purchases who haven't been matched/tagged yet.
 * Runs automatically after Clover sync or on demand via Settings.
 */
export async function processPendingPurchases(limit = 100): Promise<ProcessPendingResult> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();
    const merchantId = cfg.clover.merchantId;

    // 1. Get distinct customers from orders who have purchases
    const { data: customerOrders, error: oErr } = await sb
        .from("orders")
        .select("clover_customer_id")
        .eq("clover_merchant_id", merchantId)
        .not("clover_customer_id", "is", null)
        .limit(5000);

    if (oErr) throw new Error(`DB order customers: ${oErr.message}`);

    const distinctCustomerIds = Array.from(
        new Set((customerOrders ?? []).map((o) => o.clover_customer_id).filter(Boolean) as string[]),
    );

    if (distinctCustomerIds.length === 0) {
        return {
            processed: 0,
            matched: 0,
            unmatched: 0,
            needsReview: 0,
            conflicts: 0,
            tagsApplied: 0,
            tagsVerified: 0,
            tagsFailed: 0,
            errors: 0,
            details: [],
        };
    }

    // 2. Load customer details
    const { data: customers } = await sb
        .from("customers")
        .select("*")
        .in("clover_customer_id", distinctCustomerIds.slice(0, limit));

    const customerMap = new Map((customers ?? []).map((c) => [c.clover_customer_id, c]));

    const summary: ProcessPendingResult = {
        processed: 0,
        matched: 0,
        unmatched: 0,
        needsReview: 0,
        conflicts: 0,
        tagsApplied: 0,
        tagsVerified: 0,
        tagsFailed: 0,
        errors: 0,
        details: [],
    };

    for (const cid of distinctCustomerIds.slice(0, limit)) {
        summary.processed++;
        const cust = customerMap.get(cid);
        const fullName = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown";

        try {
            // Run the centralized match decision
            const match = await matchCloverCustomerToGhlContact({
                cloverCustomerId: cid,
                customerName: fullName,
                customerEmail: cust?.email ?? null,
                customerPhone: cust?.phone ?? null,
            });

            // Log decision to match_audit_log
            await recordMatchAudit({
                cloverCustomerId: cid,
                match,
                tagStatus: match.confident ? "pending" : "not_applicable",
            });

            if (match.status === "CONFLICT") summary.conflicts++;
            else if (match.status === "NEEDS_REVIEW" || match.status === "AMBIGUOUS_MATCH")
                summary.needsReview++;
            else if (match.status === "NO_MATCH" || match.status === "NO_IDENTIFIERS")
                summary.unmatched++;

            if (!match.confident || !match.ghlContactId) {
                summary.details.push({
                    cloverCustomerId: cid,
                    customerName: fullName,
                    status: match.status,
                    ghlContactId: null,
                    tagsProcessed: 0,
                    error: null,
                });
                continue;
            }

            summary.matched++;
            const ghlContactId = match.ghlContactId;

            // Persist verified mapping
            await persistVerifiedMapping(
                cid,
                ghlContactId,
                match.matchMethod,
                cust?.email ?? null,
                cust?.phone ?? null,
            );

            // Find all order items purchased by this customer
            const { data: custOrders } = await sb
                .from("orders")
                .select("id, clover_order_id")
                .eq("clover_merchant_id", merchantId)
                .eq("clover_customer_id", cid);

            const orderRowIds = (custOrders ?? []).map((o) => o.id);
            let tagsForCustomer = 0;

            if (orderRowIds.length > 0) {
                const { data: items } = await sb
                    .from("order_items")
                    .select("*")
                    .in("order_id", orderRowIds);

                const itemsList = items ?? [];
                const uniqueItemsByName = new Map<string, { name: string; cloverItemId: string | null }>();

                for (const item of itemsList) {
                    const norm = normalizeItemName(item.item_name);
                    if (norm && !uniqueItemsByName.has(norm)) {
                        uniqueItemsByName.set(norm, {
                            name: item.item_name,
                            cloverItemId: item.clover_item_id ?? null,
                        });
                    }
                }

                for (const [normName, info] of uniqueItemsByName.entries()) {
                    tagsForCustomer++;
                    const tagLabel = purchaseTagLabel(info.name);

                    // Apply tag
                    const tagRes = await applyPurchaseTag(ghlContactId, info.name);
                    let verificationStatus: "verified" | "failed" | "out_of_sync" = "failed";

                    if (tagRes.status === "applied" || tagRes.status === "already_tagged") {
                        summary.tagsApplied++;
                        const verify = await verifyPurchaseTag(ghlContactId, info.name);
                        verificationStatus = verify.status;
                        if (verificationStatus === "verified") {
                            summary.tagsVerified++;
                        } else {
                            summary.tagsFailed++;
                        }
                    } else {
                        summary.tagsFailed++;
                    }

                    // Persist tag record
                    const { data: existingTag } = await sb
                        .from("purchase_tags")
                        .select("id, attempt_count")
                        .eq("clover_customer_id", cid)
                        .eq("normalized_item_name", normName)
                        .maybeSingle();

                    if (existingTag) {
                        await sb
                            .from("purchase_tags")
                            .update({
                                ghl_contact_id: ghlContactId,
                                tag_label: tagLabel,
                                clover_item_id: info.cloverItemId,
                                status: tagRes.status === "error" ? "error" : "applied",
                                verification_status: verificationStatus,
                                verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
                                attempt_count: (existingTag.attempt_count ?? 0) + 1,
                                last_attempt_at: new Date().toISOString(),
                                error: tagRes.error,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", existingTag.id);
                    } else {
                        await sb.from("purchase_tags").insert({
                            clover_merchant_id: merchantId,
                            clover_customer_id: cid,
                            ghl_contact_id: ghlContactId,
                            normalized_item_name: normName,
                            tag_label: tagLabel,
                            clover_item_id: info.cloverItemId,
                            status: tagRes.status === "error" ? "error" : "applied",
                            verification_status: verificationStatus,
                            verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
                            attempt_count: 1,
                            last_attempt_at: new Date().toISOString(),
                            error: tagRes.error,
                        });
                    }
                }

                // Also trigger POS Purchase Item custom object creation for this customer's orders
                for (const ord of custOrders ?? []) {
                    try {
                        const { syncOrderToGhl } = await import("./sync.server");
                        await syncOrderToGhl(ord.clover_order_id);
                    } catch {
                        // Non-blocking for purchase tags
                    }
                }
            }

            summary.details.push({
                cloverCustomerId: cid,
                customerName: fullName,
                status: match.status,
                ghlContactId,
                tagsProcessed: tagsForCustomer,
                error: null,
            });
        } catch (err: any) {
            summary.errors++;
            summary.details.push({
                cloverCustomerId: cid,
                customerName: fullName,
                status: "ERROR",
                ghlContactId: null,
                tagsProcessed: 0,
                error: err?.message ?? String(err),
            });
        }
    }

    return summary;
}
