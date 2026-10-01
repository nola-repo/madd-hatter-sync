//
// Server-only: CENTRALIZED customer identity resolver.
// This is the SINGLE source of truth for matching Clover customers to GHL contacts.
//
// MATCHING RULES (in priority order):
//   A. Existing verified mapping — reuse it instantly.
//   B. Email + phone both match the SAME GHL contact — confident match.
//   C. Exact unique email match — confident match.
//   D. Exact unique phone match — confident match.
//   E. Name-only — auto-create new GHL contact if no match found.
//   F. No identifiers at all — auto-create using name if available.
//
// Auto-create ensures every Clover purchase creates a POS Purchase Item in GHL.
// Every decision is recorded in match_audit_log for full observability.
import { getSupabaseServer } from "./supabase.server";
import { getIntegrationConfig } from "./config.server";
import { normalizeEmail, normalizePhone } from "./matching.server";
import {
  searchContactsByEmail,
  searchContactsByPhone,
  createGhlContact,
  type GhlContact,
} from "./ghl.server";

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
  | "NO_CUSTOMER"
  | "AUTO_CREATED";

export type MatchMethod = "mapping" | "email_phone" | "email" | "phone" | "none" | "auto_create";

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

  // Instance A: Total Anonymity — No email, no phone, no name (or no identifiers at all).
  // Immediately bypass GHL sync/review queue and route to catch-all / no-op.
  if (!email && !phone) {
    const contactName = input.customerName?.trim() ?? null;

    // Instance D: Invalid Info — Name Only (Name present, but NO Email and NO Phone).
    // Flag as NEEDS_REVIEW / name_only so it can be held back safely without cluttering review queue as an anonymous profile.
    if (contactName && contactName.length > 1) {
      return {
        status: "NEEDS_REVIEW",
        ghlContactId: null,
        matchMethod: "none",
        evidence: buildEvidence(null, null, [], []),
        reason: `Instance D (Name Only): Customer "${contactName}" has no email or phone. Held back from auto-creation to prevent unidentifiable profiles.`,
        confident: false,
      };
    }

    // Instance A: Total Anonymity — No email, no phone, no name.
    return {
      status: "NO_IDENTIFIERS",
      ghlContactId: null,
      matchMethod: "none",
      evidence: buildEvidence(null, null, [], []),
      reason:
        "Instance A (Total Anonymity): Customer has no email, phone, or name. Bypassing CRM sync.",
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

  // RULE G — has identifiers but no match found in GHL.
  // Auto-create a GHL contact so the purchase record can still be created.
  const contactName = input.customerName?.trim() ?? null;
  try {
    const created = await createGhlContact({
      firstName: contactName ? (contactName.split(" ")[0] ?? contactName) : "Clover",
      lastName: contactName ? contactName.split(" ").slice(1).join(" ") || "Customer" : "Customer",
      email: email || "",
      phone: phone || "",
      note: `Auto-created from Clover POS. Clover Customer ID: ${input.cloverCustomerId ?? "unknown"}`,
    });
    return {
      status: "AUTO_CREATED",
      ghlContactId: created.id,
      matchMethod: "auto_create",
      evidence,
      reason: `No existing GHL contact found. Auto-created new contact for "${contactName ?? "Clover Customer"}" with available identifiers.`,
      confident: true,
    };
  } catch (createErr: any) {
    return {
      status: "NO_MATCH",
      ghlContactId: null,
      matchMethod: "none",
      evidence,
      reason: `No existing GHL contact found and auto-create failed: ${createErr?.message ?? "unknown"}.`,
      confident: false,
    };
  }
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
