//
// Server-only customer matching + order preview logic.
import { fetchCloverCustomer, fetchCloverOrder } from "./clover.server";
import { getCustomerMapping } from "./supabase.server";
import {
    findPurchaseObjectSchema,
    searchContactsByEmail,
    searchContactsByPhone,
    validatePurchaseSchema,
    type SchemaValidation,
} from "./ghl.server";
import { getIntegrationConfig } from "./config.server";
import type { CloverOrder, CustomerMatchPreview, MatchDecision, OrderPreview } from "./types";

// ---- Normalization -----------------------------------------------------

export function normalizeEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const e = email.trim().toLowerCase();
    if (!e.includes("@") || e.length < 3) return null;
    return e;
}

// E.164-ish normalization: digits only, strip leading country-code duplicates.
// Returns the canonical form WITHOUT a leading "+" (e.g. "12015543794").
// Use phoneFormatVariants() to get all the shapes CRM's API expects.
export function normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) return null;
    // Normalize US numbers to 11 digits starting with 1.
    if (digits.length === 10) return `1${digits}`;
    return digits;
}

/**
 * Return every format a CRM contact lookup might store a US number in, so the
 * search can try each variant. Previously we only queried with the bare
 * "1XXXXXXXXXX" form, which almost never matched CRM contacts stored as
 * "+1XXXXXXXXXX" or "(201) 554-3794" — silently zeroing out every phone match.
 */
export function phoneFormatVariants(phone: string | null | undefined): string[] {
    const norm = normalizePhone(phone);
    if (!norm) return [];
    const variants = new Set<string>();
    variants.add(norm); // 12015543794
    if (norm.startsWith("1") && norm.length === 11) {
        const ten = norm.slice(1); // 2015543794
        variants.add(ten);
        variants.add(`+1${ten}`); // +12015543794
        variants.add(`+${norm}`); // +12015543794 (same, harmless)
    } else {
        variants.add(`+${norm}`);
    }
    return [...variants];
}

// ---- Deterministic purchase reference ---------------------------------

export function purchaseReference(merchantId: string, orderId: string, lineItemId: string): string {
    return `${merchantId}:${orderId}:${lineItemId}`;
}

// ---- Eligibility -------------------------------------------------------

export type ItemEligibility = {
    eligible: boolean;
    flag: string | null;
};

export function assessOrderEligibility(order: CloverOrder): {
    eligible: boolean;
    flag: string | null;
} {
    if (order.paymentStatus === "REFUNDED") {
        return { eligible: false, flag: "Refunded order — held for review" };
    }
    if (order.paymentStatus === "PARTIALLY_PAID") {
        return { eligible: false, flag: "Partially paid order — held for review" };
    }
    if (order.paymentStatus === "OPEN") {
        return { eligible: false, flag: "Unpaid/open order — held for review" };
    }
    if (order.lineItems.length === 0) {
        return { eligible: false, flag: "No line items on order" };
    }
    return { eligible: true, flag: null };
}

// ---- Customer matching ------------------------------------------------

export async function matchCustomer(order: CloverOrder): Promise<CustomerMatchPreview> {
    const cfg = getIntegrationConfig();
    const merchantId = cfg.clover.merchantId;

    // Multiple customers attached -> review.
    if (order.customerIds.length > 1) {
        return {
            decision: "held_for_review",
            reason: `Multiple customers (${order.customerIds.length}) attached to this order — cannot auto-match.`,
            ghlContactId: null,
            candidates: [],
        };
    }

    const customer = order.customer;
    if (!customer) {
        return {
            decision: "anonymous",
            reason: "No customer attached to this Clover order. Purchase will be preserved as unmatched.",
            ghlContactId: null,
            candidates: [],
        };
    }

    // 1. Saved mapping.
    if (customer.id) {
        const mapping = await getCustomerMapping(merchantId, customer.id);
        if (mapping) {
            return {
                decision: "matched_existing",
                reason: `Reused saved mapping (matched by ${mapping.matched_by}).`,
                ghlContactId: mapping.ghl_contact_id,
                candidates: [
                    {
                        id: mapping.ghl_contact_id,
                        firstName: "",
                        lastName: "",
                        email: "",
                        phone: "",
                        matchedBy: "mapping",
                    },
                ],
            };
        }
    }

    const email = normalizeEmail(customer.email);
    const phone = normalizePhone(customer.phone);

    if (!email && !phone) {
        return {
            decision: "held_for_review",
            reason: "Customer has no usable email or phone — cannot match or create safely.",
            ghlContactId: null,
            candidates: [],
        };
    }

    // 2. Lookup by email and phone.
    const emailMatches = email ? await searchContactsByEmail(email) : [];
    const phoneMatches = phone ? await searchContactsByPhone(phone) : [];

    const emailIds = new Set(emailMatches.map((c) => c.id));
    const phoneIds = new Set(phoneMatches.map((c) => c.id));

    // Email and phone match different contacts -> review.
    if (email && phone && emailMatches.length && phoneMatches.length) {
        const overlap = emailMatches.filter((c) => phoneIds.has(c.id));
        const emailOnly = emailMatches.filter((c) => !phoneIds.has(c.id));
        const phoneOnly = phoneMatches.filter((c) => !emailIds.has(c.id));
        if (emailOnly.length && phoneOnly.length) {
            return {
                decision: "held_for_review",
                reason:
                    "Email and phone match different GHL contacts — cannot auto-resolve which contact to use.",
                ghlContactId: null,
                candidates: [
                    ...emailOnly.map((c) => ({ ...c, matchedBy: "email" as const })),
                    ...phoneOnly.map((c) => ({ ...c, matchedBy: "phone" as const })),
                ],
            };
        }
        // overlap exists — unambiguous single contact.
        if (overlap.length === 1) {
            return {
                decision: "matched_existing",
                reason: `Matched existing GHL contact by email + phone.`,
                ghlContactId: overlap[0].id,
                candidates: [{ ...overlap[0], matchedBy: "email" }],
            };
        }
    }

    // Unambiguous single email match.
    if (emailMatches.length === 1) {
        return {
            decision: "matched_existing",
            reason: `Matched existing GHL contact by email.`,
            ghlContactId: emailMatches[0].id,
            candidates: [{ ...emailMatches[0], matchedBy: "email" }],
        };
    }
    // Unambiguous single phone match.
    if (phoneMatches.length === 1) {
        return {
            decision: "matched_existing",
            reason: `Matched existing GHL contact by phone.`,
            ghlContactId: phoneMatches[0].id,
            candidates: [{ ...phoneMatches[0], matchedBy: "phone" }],
        };
    }
    // Multiple matches on the same identifier -> review.
    if (emailMatches.length > 1 || phoneMatches.length > 1) {
        return {
            decision: "held_for_review",
            reason: `Multiple GHL contacts match the same ${emailMatches.length > 1 ? "email" : "phone"} — cannot auto-resolve.`,
            ghlContactId: null,
            candidates: [
                ...emailMatches.map((c) => ({ ...c, matchedBy: "email" as const })),
                ...phoneMatches.map((c) => ({ ...c, matchedBy: "phone" as const })),
            ],
        };
    }

    // 3. No match and we have usable identifying info, but we NEVER create contacts.
    // Return held_for_review so the preview accurately reflects what sync will do.
    if (email || phone) {
        return {
            decision: "held_for_review",
            reason: "No existing GHL contact found for this customer. Order will be held for review — no contact will be created automatically.",
            ghlContactId: null,
            candidates: [],
        };
    }

    return {
        decision: "held_for_review",
        reason: "Insufficient identifying information to match or create.",
        ghlContactId: null,
        candidates: [],
    };
}

// ---- Full order preview ------------------------------------------------

export async function buildOrderPreview(orderId: string): Promise<OrderPreview> {
    const cfg = getIntegrationConfig();
    const order = await fetchCloverOrder(orderId);

    // Validate merchant id matches config.
    if (order.merchantId !== cfg.clover.merchantId) {
        throw new Error(
            `Order merchant ${order.merchantId} does not match configured merchant ${cfg.clover.merchantId}.`,
        );
    }

    const match = await matchCustomer(order);
    const orderElig = assessOrderEligibility(order);

    const items = order.lineItems.map((li) => {
        const ref = purchaseReference(order.merchantId, order.id, li.id);
        let eligible = orderElig.eligible;
        let flag: string | null = orderElig.flag;
        if (eligible && match.decision === "held_for_review") {
            eligible = false;
            flag = "Customer held for review — purchase record not created";
        }
        if (eligible && match.decision === "anonymous") {
            eligible = false;
            flag = "Anonymous purchase — preserved as unmatched, no GHL record";
        }
        return { lineItem: li, purchaseReference: ref, eligible, flag };
    });

    return {
        order,
        match,
        items,
        orderEligible: orderElig.eligible,
        orderFlag: orderElig.flag,
    };
}

// ---- Schema validation (for preview display) -------------------------

export async function getSchemaValidation(): Promise<SchemaValidation & { debug?: any }> {
    const result = await findPurchaseObjectSchema();
    const validation = validatePurchaseSchema(result.schema);
    return { ...validation, debug: result.debug };
}

// re-export for sync module
export { fetchCloverCustomer };
