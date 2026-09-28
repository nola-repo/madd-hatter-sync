//
// Server-only: GHL contact tag operations for purchase tagging.
// Applies "Purchased: <Item>" tags to GHL contacts without duplicating.
import { getIntegrationConfig } from "./config.server";

class GhlApiError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
        super(`GHL API error ${status}: ${body.slice(0, 300)}`);
        this.name = "GhlApiError";
        this.status = status;
        this.body = body;
    }
}

/**
 * Normalize an item name for consistent tag naming.
 * "WINGS", "Wings", "  wings " all become "Wings".
 */
export function normalizeItemName(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\B\w/g, (c) => c.toLowerCase());
}

/**
 * The tag label applied to a GHL contact, e.g. "Purchased: Wings".
 */
export function purchaseTagLabel(itemName: string): string {
    return `Clover - Purchased: ${normalizeItemName(itemName)}`;
}

export type TagResult = {
    status: "applied" | "already_tagged" | "error";
    error: string | null;
};

export type TagVerificationResult = {
    verified: boolean;
    status: "verified" | "failed" | "out_of_sync";
    error: string | null;
};

/**
 * Fetch the current tags on a GHL contact.
 */
export async function getContactTags(contactId: string): Promise<string[]> {
    const cfg = getIntegrationConfig();
    const res = await fetch(`${cfg.ghl.apiBase}/contacts/${contactId}`, {
        headers: {
            Authorization: `Bearer ${cfg.ghl.pitToken?.trim() ?? ""}`,
            Version: "2021-07-28",
            Accept: "application/json",
        },
    });
    const text = await res.text();
    if (!res.ok) throw new GhlApiError(res.status, text);
    const json = text ? JSON.parse(text) : null;
    const tags = json?.contact?.tags ?? json?.tags ?? [];
    return Array.isArray(tags) ? tags : [];
}

/**
 * Apply a purchase tag to a GHL contact.
 * Idempotent: if the tag already exists, returns "already_tagged".
 * Does NOT remove or modify any other existing tags.
 */
export async function applyPurchaseTag(contactId: string, itemName: string): Promise<TagResult> {
    const tag = purchaseTagLabel(itemName);
    const cfg = getIntegrationConfig();

    try {
        // Check existing tags to avoid duplicates.
        let existing: string[] = [];
        try {
            existing = await getContactTags(contactId);
        } catch {
            // If we can't read tags, proceed to add — GHL dedupes on its side too.
        }
        if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            return { status: "already_tagged", error: null };
        }

        // Add the tag via the contacts/tags endpoint.
        const res = await fetch(`${cfg.ghl.apiBase}/contacts/${contactId}/tags`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.ghl.pitToken?.trim() ?? ""}`,
                Version: "2021-07-28",
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ tags: [tag] }),
        });
        const text = await res.text();
        if (!res.ok) throw new GhlApiError(res.status, text);
        return { status: "applied", error: null };
    } catch (e: any) {
        return {
            status: "error",
            error: e?.message ?? String(e),
        };
    }
}

/**
 * VERIFY that a purchase tag actually exists on the GHL contact.
 * A successful POST is NOT sufficient proof — we re-read the contact's tags
 * and confirm the expected tag is present.
 *
 * Returns:
 *   - "verified": tag confirmed present in GHL.
 *   - "failed": could not read the contact (API error).
 *   - "out_of_sync": contact read OK, but the expected tag is missing.
 */
export async function verifyPurchaseTag(
    contactId: string,
    itemName: string,
): Promise<TagVerificationResult> {
    const tag = purchaseTagLabel(itemName);
    try {
        const tags = await getContactTags(contactId);
        const present = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (present) {
            return { verified: true, status: "verified", error: null };
        }
        return {
            verified: false,
            status: "out_of_sync",
            error: `Tag "${tag}" was applied but is not present on contact ${contactId}.`,
        };
    } catch (e: any) {
        return {
            verified: false,
            status: "failed",
            error: e?.message ?? String(e),
        };
    }
}
