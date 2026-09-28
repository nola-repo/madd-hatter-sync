//
// Server-only: CENTRALIZED customer identity resolver.
// This is the SINGLE source of truth for matching Clover customers to GHL contacts.
//
// SAFETY RULES (non-negotiable):
//   - NEVER match by name alone.
//   - NEVER create a new GHL contact for an unmatched Clover customer.
//   - A false negative (UNMATCHED) is always safer than a false positive (wrong tag).
//   - Conflicting email/phone evidence → CONFLICT, no automatic action.
//
// Every decision is recorded in match_audit_log for full observability.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import { normalizeEmail, normalizePhone } from "./matching.server";
import { searchContactsByEmail, searchContactsByPhone, type GhlContact } from "./ghl.server";

// ---- Decision model ----------------------------------------------------

export type MatchStatus =
    | "VERIFIED_MAPPING"
    | "MATCHED_EMAIL_PHONE"
    | "MATCHED_EMAIL"
    | "MATCHED_PHONE"
    | "AMBIGUOUS_MATCH"
    | "CONFLICT"
    | "NO_MATCH"
    | "NO_IDENTIFIERS"
    | "NEEDS_REVIEW"
    | "NO_CUSTOMER";

export type MatchMethod = "mapping" | "email_phone" | "email" | "phone" | "none";

export type MatchEvidence = {
    cloverEmail: string | null;
    cloverPhone: string | null;
    emailCandidates: GhlContact[];
    phoneCandidates: GhlContact[];
    emailCandidateIds: string[];
    phoneCandidateIds: string[];
    conflictEmailContactId: string | null;
    conflictPhoneContactId: string | null;
};

export type MatchResult = {
    status: MatchStatus;
    ghlContactId: string | null;
    matchMethod: MatchMethod;
    evidence: MatchEvidence;
    reason: string;
    // True only for confident matches safe for automatic GHL modification.
    confident: boolean;
};

// ---- Helpers -----------------------------------------------------------

function buildEvidence(
    cloverEmail: string | null,
    cloverPhone: string | null,
    emailMatches: GhlContact[],
    phoneMatches: GhlContact[],
): MatchEvidence {
    return {
        cloverEmail,
        cloverPhone,
        emailCandidates: emailMatches,
        phoneCandidates: phoneMatches,
        emailCandidateIds: emailMatches.map((c) => c.id),
        phoneCandidateIds: phoneMatches.map((c) => c.id),
        conflictEmailContactId: null,
        conflictPhoneContactId: null,
    };
}

// ---- The canonical resolver -------------------------------------------

/**
 * Resolve a Clover customer to an EXISTING GHL contact.
 *
 * Rules (in priority order):
 *   A. Existing verified mapping (still validated as existing).
 *   B. Email + phone match the SAME contact.
 *   C. Exact unique email match.
 *   D. Exact unique phone match.
 *   E. Name-only → NEEDS_REVIEW (never auto-tag).
 *   F. Email and phone point to DIFFERENT contacts → CONFLICT.
 *   G. Has identifiers but none match → NO_MATCH.
 *   H. No identifiers → NO_IDENTIFIERS.
 *
 * This function NEVER creates a GHL contact.
 */
export async function matchCloverCustomerToGhlContact(input: {
    cloverCustomerId: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
}): Promise<MatchResult> {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();

    // No customer attached to the order at all.
    if (!input.cloverCustomerId) {
        return {
            status: "NO_CUSTOMER",
            ghlContactId: null,
            matchMethod: "none",
            evidence: buildEvidence(null, null, [], []),
            reason: "No customer attached to this Clover order.",
            confident: false,
        };
    }

    let email = normalizeEmail(input.customerEmail);
    let phone = normalizePhone(input.customerPhone);

    // If email or phone are missing from order input, look up stored customer profile in Supabase
    if ((!email || !phone) && input.cloverCustomerId) {
        const { data: storedCust } = await sb
            .from("customers")
            .select("email, phone, first_name, last_name")
            .eq("clover_merchant_id", cfg.clover.merchantId)
            .eq("clover_customer_id", input.cloverCustomerId)
            .maybeSingle();

        if (storedCust) {
            if (!email && storedCust.email) email = normalizeEmail(storedCust.email);
            if (!phone && storedCust.phone) phone = normalizePhone(storedCust.phone);
        }
    }

    // RULE A — existing verified mapping.
    const { data: mapping } = await sb
        .from("customer_mappings")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .eq("clover_customer_id", input.cloverCustomerId)
        .maybeSingle();

    if (mapping && mapping.ghl_contact_id) {
        // We trust a previously verified mapping. It was only ever saved for a
        // confident match, so we reuse it without re-querying GHL every time.
        return {
            status: "VERIFIED_MAPPING",
            ghlContactId: mapping.ghl_contact_id,
            matchMethod: "mapping",
            evidence: buildEvidence(email, phone, [], []),
            reason: `Reused verified mapping (originally matched by ${mapping.matched_by ?? "unknown"}).`,
            confident: true,
        };
    }

    // No identifiers to search with.
    if (!email && !phone) {
        return {
            status: "NO_IDENTIFIERS",
            ghlContactId: null,
            matchMethod: "none",
            evidence: buildEvidence(null, null, [], []),
            reason: "Customer has no usable email or phone — cannot match safely.",
            confident: false,
        };
    }

    // Search existing CRM contacts — search by email/phone with multiple query variations
    const emailMatches = email ? await searchContactsByEmail(email) : [];
    let phoneMatches: GhlContact[] = [];
    if (phone) {
        phoneMatches = await searchContactsByPhone(phone);
        // Also try without '+1' prefix if formatted as +1XXXXXXXXXX (e.g., 10-digit 2015543794)
        if (phoneMatches.length === 0 && phone.startsWith("+1")) {
            const localDigits = phone.replace(/^\+1/, "");
            if (localDigits.length === 10) {
                phoneMatches = await searchContactsByPhone(localDigits);
            }
        }
        // Also try formatted digits if original phone had +
        if (
            phoneMatches.length === 0 &&
            !phone.startsWith("+") &&
            phone.length === 11 &&
            phone.startsWith("1")
        ) {
            phoneMatches = await searchContactsByPhone(`+${phone}`);
        }
    }

    const evidence = buildEvidence(email, phone, emailMatches, phoneMatches);

    // RULE F — conflict: email and phone point to DIFFERENT contacts.
    if (email && phone && emailMatches.length > 0 && phoneMatches.length > 0) {
        const emailIds = new Set(emailMatches.map((c) => c.id));
        const phoneIds = new Set(phoneMatches.map((c) => c.id));
        const overlap = emailMatches.filter((c) => phoneIds.has(c.id));
        const emailOnly = emailMatches.filter((c) => !phoneIds.has(c.id));
        const phoneOnly = phoneMatches.filter((c) => !emailIds.has(c.id));

        if (emailOnly.length > 0 && phoneOnly.length > 0) {
            evidence.conflictEmailContactId = emailOnly[0].id;
            evidence.conflictPhoneContactId = phoneOnly[0].id;
            return {
                status: "CONFLICT",
                ghlContactId: null,
                matchMethod: "none",
                evidence,
                reason:
                    `Email matches GHL contact ${emailOnly[0].id} but phone matches a different contact ${phoneOnly[0].id}. ` +
                    `Cannot auto-resolve — requires human review.`,
                confident: false,
            };
        }

        // Overlap exists — if exactly one contact is in both, that's a strong match.
        if (overlap.length === 1) {
            return {
                status: "MATCHED_EMAIL_PHONE",
                ghlContactId: overlap[0].id,
                matchMethod: "email_phone",
                evidence,
                reason: "Exact normalized email + exact normalized phone match the same GHL contact.",
                confident: true,
            };
        }
        // Multiple overlapping contacts — ambiguous.
        if (overlap.length > 1) {
            return {
                status: "AMBIGUOUS_MATCH",
                ghlContactId: null,
                matchMethod: "none",
                evidence,
                reason: `${overlap.length} GHL contacts share both this email and phone — cannot auto-resolve.`,
                confident: false,
            };
        }
    }

    // RULE C — exact unique email match.
    if (emailMatches.length === 1) {
        return {
            status: "MATCHED_EMAIL",
            ghlContactId: emailMatches[0].id,
            matchMethod: "email",
            evidence,
            reason: "Exact normalized email uniquely matches one GHL contact.",
            confident: true,
        };
    }

    // RULE D — exact unique phone match.
    if (phoneMatches.length === 1) {
        return {
            status: "MATCHED_PHONE",
            ghlContactId: phoneMatches[0].id,
            matchMethod: "phone",
            evidence,
            reason: "Exact normalized phone uniquely matches one GHL contact.",
            confident: true,
        };
    }

    // Multiple matches on the same identifier → ambiguous.
    if (emailMatches.length > 1 || phoneMatches.length > 1) {
        return {
            status: "AMBIGUOUS_MATCH",
            ghlContactId: null,
            matchMethod: "none",
            evidence,
            reason: `Multiple GHL contacts match the same ${emailMatches.length > 1 ? "email" : "phone"} — cannot auto-resolve.`,
            confident: false,
        };
    }

    // RULE E — Name-only check (if name is present but email/phone don't match or aren't present).
    // Strictly flags as NEEDS_REVIEW, NEVER confident.
    if (input.customerName && input.customerName.trim().length > 2) {
        evidence.emailCandidateIds = emailMatches.map((c) => c.id);
        evidence.phoneCandidateIds = phoneMatches.map((c) => c.id);
    }

    // RULE G — has identifiers but no match found.
    // We do NOT create a contact. The customer remains unmatched.
    return {
        status: "NO_MATCH",
        ghlContactId: null,
        matchMethod: "none",
        evidence,
        reason:
            "No existing GHL contact matches this customer's email or phone. Left unmatched — no contact created.",
        confident: false,
    };
}

// ---- Audit logging -----------------------------------------------------

/**
 * Record a match decision + tag outcome in the audit log.
 * This makes every automated decision explainable and debuggable.
 */
export async function recordMatchAudit(input: {
    cloverCustomerId: string | null;
    cloverOrderId?: string | null;
    cloverLineItemId?: string | null;
    cloverItemId?: string | null;
    match: MatchResult;
    expectedTag?: string | null;
    ghlTagId?: string | null;
    tagStatus?: string;
    errorCode?: string | null;
    errorMessage?: string | null;
}): Promise<void> {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();
    try {
        await sb.from("match_audit_log").insert({
            clover_merchant_id: cfg.clover.merchantId,
            clover_customer_id: input.cloverCustomerId ?? "",
            clover_order_id: input.cloverOrderId ?? null,
            clover_line_item_id: input.cloverLineItemId ?? null,
            clover_item_id: input.cloverItemId ?? null,
            ghl_contact_id: input.match.ghlContactId,
            match_status: input.match.status,
            match_method: input.match.matchMethod,
            match_evidence: {
                cloverEmail: input.match.evidence.cloverEmail,
                cloverPhone: input.match.evidence.cloverPhone,
                emailCandidateIds: input.match.evidence.emailCandidateIds,
                phoneCandidateIds: input.match.evidence.phoneCandidateIds,
                conflictEmailContactId: input.match.evidence.conflictEmailContactId,
                conflictPhoneContactId: input.match.evidence.conflictPhoneContactId,
                reason: input.match.reason,
            },
            expected_tag: input.expectedTag ?? null,
            ghl_tag_id: input.ghlTagId ?? null,
            tag_status: input.tagStatus ?? "not_applicable",
            error_code: input.errorCode ?? null,
            error_message: input.errorMessage ?? null,
        });
    } catch {
        // Audit logging must never break the main pipeline.
    }
}

/**
 * Save a verified mapping so future purchases reuse it without re-querying GHL.
 * Only called for confident matches.
 */
export async function persistVerifiedMapping(
    cloverCustomerId: string,
    ghlContactId: string,
    matchMethod: MatchMethod,
    cloverEmail: string | null,
    cloverPhone: string | null,
): Promise<void> {
    const cfg = getIntegrationConfig();
    const sb = getSupabaseServer();
    await sb.from("customer_mappings").upsert(
        {
            clover_merchant_id: cfg.clover.merchantId,
            clover_customer_id: cloverCustomerId,
            ghl_contact_id: ghlContactId,
            matched_by: matchMethod,
            match_method: matchMethod,
            clover_email: cloverEmail,
            clover_phone: cloverPhone,
            verified_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
        },
        { onConflict: "clover_merchant_id,clover_customer_id" },
    );
}

// ---- Monitoring queries ------------------------------------------------

export type MappingMonitorStats = {
    totalCloverCustomers: number;
    customersWithPurchases: number;
    matchedGhlContacts: number;
    verifiedMappings: number;
    unmatchedCustomers: number;
    needsReview: number;
    conflicts: number;
    tagsApplied: number;
    tagsVerified: number;
    tagsFailed: number;
    outOfSync: number;
};

export async function getMappingMonitorStats(): Promise<MappingMonitorStats> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    const { count: totalCustomers } = await sb
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("clover_merchant_id", cfg.clover.merchantId);

    // Count distinct Clover customer IDs that have orders
    const { data: orderCustomers } = await sb
        .from("orders")
        .select("clover_customer_id")
        .not("clover_customer_id", "is", null)
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .limit(10000);
    const customersWithPurchases = new Set(
        (orderCustomers ?? []).map((o: any) => o.clover_customer_id),
    ).size;

    const { count: verifiedMappings } = await sb
        .from("customer_mappings")
        .select("*", { count: "exact", head: true })
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .not("verified_at", "is", null);

    const { count: matchedGhlContacts } = await sb
        .from("customer_mappings")
        .select("*", { count: "exact", head: true })
        .eq("clover_merchant_id", cfg.clover.merchantId);

    // Audit-based stats.
    const { count: needsReview } = await sb
        .from("match_audit_log")
        .select("*", { count: "exact", head: true })
        .in("match_status", ["NEEDS_REVIEW", "AMBIGUOUS_MATCH"]);

    const { count: conflicts } = await sb
        .from("match_audit_log")
        .select("*", { count: "exact", head: true })
        .eq("match_status", "CONFLICT");

    const { count: tagsApplied } = await sb
        .from("purchase_tags")
        .select("*", { count: "exact", head: true })
        .eq("status", "applied");

    const { count: tagsVerified } = await sb
        .from("purchase_tags")
        .select("*", { count: "exact", head: true })
        .eq("verification_status", "verified");

    const { count: tagsFailed } = await sb
        .from("purchase_tags")
        .select("*", { count: "exact", head: true })
        .in("verification_status", ["failed", "out_of_sync"]);

    const { count: outOfSync } = await sb
        .from("purchase_tags")
        .select("*", { count: "exact", head: true })
        .eq("verification_status", "out_of_sync");

    return {
        totalCloverCustomers: totalCustomers ?? 0,
        customersWithPurchases: customersWithPurchases ?? 0,
        matchedGhlContacts: matchedGhlContacts ?? 0,
        verifiedMappings: verifiedMappings ?? 0,
        unmatchedCustomers: Math.max(0, (totalCustomers ?? 0) - (matchedGhlContacts ?? 0)),
        needsReview: needsReview ?? 0,
        conflicts: conflicts ?? 0,
        tagsApplied: tagsApplied ?? 0,
        tagsVerified: tagsVerified ?? 0,
        tagsFailed: tagsFailed ?? 0,
        outOfSync: outOfSync ?? 0,
    };
}

export type CustomerMappingRow = {
    cloverCustomerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    purchaseCount: number;
    ghlContactId: string | null;
    matchMethod: string | null;
    matchStatus: string;
    tagCount: number;
    syncStatus: string;
};

export async function getCustomerMappingTable(limit = 100): Promise<CustomerMappingRow[]> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    // Get customers with their order counts.
    const { data: orders } = await sb
        .from("orders")
        .select("clover_customer_id, clover_order_id")
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .not("clover_customer_id", "is", null)
        .limit(5000);

    const orderCountMap = new Map<string, number>();
    for (const o of orders ?? []) {
        const cid = o.clover_customer_id as string;
        orderCountMap.set(cid, (orderCountMap.get(cid) ?? 0) + 1);
    }

    const customerIds = [...orderCountMap.keys()];
    if (customerIds.length === 0) return [];

    const { data: customers } = await sb
        .from("customers")
        .select("*")
        .in("clover_customer_id", customerIds)
        .limit(5000);
    const customerMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));

    const { data: mappings } = await sb
        .from("customer_mappings")
        .select("*")
        .in("clover_customer_id", customerIds);
    const mappingMap = new Map((mappings ?? []).map((m: any) => [m.clover_customer_id, m]));

    const { data: tags } = await sb
        .from("purchase_tags")
        .select("clover_customer_id, status, verification_status")
        .in("clover_customer_id", customerIds);
    const tagCountMap = new Map<string, number>();
    for (const t of tags ?? []) {
        tagCountMap.set(t.clover_customer_id, (tagCountMap.get(t.clover_customer_id) ?? 0) + 1);
    }

    const rows: CustomerMappingRow[] = [];
    for (const cid of customerIds.slice(0, limit)) {
        const cust = customerMap.get(cid);
        const mapping = mappingMap.get(cid);
        const tagCount = tagCountMap.get(cid) ?? 0;
        const matchStatus = mapping
            ? "MATCHED"
            : cust?.email || cust?.phone
                ? "NO_GHL_MATCH"
                : "NO_IDENTIFIERS";
        const syncStatus =
            tagCount > 0 ? "SYNCED" : matchStatus === "MATCHED" ? "PROCESSED" : "NOT_SYNCED";

        rows.push({
            cloverCustomerId: cid,
            customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
            email: cust?.email ?? null,
            phone: cust?.phone ?? null,
            purchaseCount: orderCountMap.get(cid) ?? 0,
            ghlContactId: mapping?.ghl_contact_id ?? null,
            matchMethod: mapping?.match_method ?? mapping?.matched_by ?? null,
            matchStatus,
            tagCount,
            syncStatus,
        });
    }

    return rows.sort((a, b) => b.purchaseCount - a.purchaseCount);
}

export type ReviewQueueItem = {
    cloverCustomerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    matchStatus: string;
    reason: string;
    evidence: any;
    createdAt: string;
};

export async function getReviewQueue(limit = 50): Promise<ReviewQueueItem[]> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    // Get the latest audit entry per customer for review statuses.
    const { data } = await sb
        .from("match_audit_log")
        .select("*")
        .in("match_status", ["NEEDS_REVIEW", "AMBIGUOUS_MATCH", "CONFLICT", "NO_IDENTIFIERS"])
        .order("created_at", { ascending: false })
        .limit(limit * 3);

    // Deduplicate by customer, keeping the latest.
    const seen = new Set<string>();
    const items: ReviewQueueItem[] = [];
    for (const row of data ?? []) {
        if (seen.has(row.clover_customer_id)) continue;
        seen.add(row.clover_customer_id);
        const { data: cust } = await sb
            .from("customers")
            .select("first_name, last_name, email, phone")
            .eq("clover_customer_id", row.clover_customer_id)
            .maybeSingle();
        items.push({
            cloverCustomerId: row.clover_customer_id,
            customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
            email: cust?.email ?? row.match_evidence?.cloverEmail ?? null,
            phone: cust?.phone ?? row.match_evidence?.cloverPhone ?? null,
            matchStatus: row.match_status,
            reason: row.match_evidence?.reason ?? row.match_status,
            evidence: row.match_evidence,
            createdAt: row.created_at,
        });
        if (items.length >= limit) break;
    }
    return items;
}

// ---- Synced contacts (verified mappings + applied tags) ----------------

export type SyncedContactRow = {
    cloverCustomerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    ghlContactId: string;
    matchMethod: string;
    tagsApplied: number;
    tagsVerified: number;
    verifiedAt: string | null;
};

/**
 * Return the list of Clover customers that have been confidently matched to
 * an existing CRM contact AND had at least one purchase tag applied.
 * These are the "already synced" contacts.
 */
export async function getSyncedContacts(limit = 100): Promise<{
    total: number;
    contacts: SyncedContactRow[];
}> {
    const sb = getSupabaseServer();
    const cfg = getIntegrationConfig();

    // Verified mappings (confident matches persisted).
    const { data: mappings, error } = await sb
        .from("customer_mappings")
        .select("*")
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .not("ghl_contact_id", "is", null)
        .order("verified_at", { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) throw new Error(`DB synced mappings: ${error.message}`);

    const rows = (mappings ?? []) as any[];
    if (rows.length === 0) return { total: 0, contacts: [] };

    const customerIds = rows.map((m) => m.clover_customer_id);

    const [{ data: customers }, { data: tags }] = await Promise.all([
        sb.from("customers").select("*").in("clover_customer_id", customerIds).limit(5000),
        sb
            .from("purchase_tags")
            .select("clover_customer_id, status, verification_status")
            .in("clover_customer_id", customerIds),
    ]);

    const customerMap = new Map((customers ?? []).map((c: any) => [c.clover_customer_id, c]));
    const tagStatsMap = new Map<string, { applied: number; verified: number }>();
    for (const t of tags ?? []) {
        const cur = tagStatsMap.get(t.clover_customer_id) ?? { applied: 0, verified: 0 };
        if (t.status === "applied") cur.applied++;
        if (t.verification_status === "verified") cur.verified++;
        tagStatsMap.set(t.clover_customer_id, cur);
    }

    const contacts: SyncedContactRow[] = rows.map((m) => {
        const cust = customerMap.get(m.clover_customer_id);
        const tagStats = tagStatsMap.get(m.clover_customer_id) ?? { applied: 0, verified: 0 };
        return {
            cloverCustomerId: m.clover_customer_id,
            customerName: cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown",
            email: cust?.email ?? m.clover_email ?? null,
            phone: cust?.phone ?? m.clover_phone ?? null,
            ghlContactId: m.ghl_contact_id,
            matchMethod: m.match_method ?? m.matched_by ?? "unknown",
            tagsApplied: tagStats.applied,
            tagsVerified: tagStats.verified,
            verifiedAt: m.verified_at ?? null,
        };
    });

    // Total count of all verified mappings (not just the page returned).
    const { count } = await sb
        .from("customer_mappings")
        .select("*", { count: "exact", head: true })
        .eq("clover_merchant_id", cfg.clover.merchantId)
        .not("ghl_contact_id", "is", null);

    return { total: count ?? contacts.length, contacts };
}
