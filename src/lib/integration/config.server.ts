//
// Server-only configuration. Reads secrets from process.env at call time.
// This module is browser-safe to import (it only reads env inside functions),
// but values are only meaningful on the server.

export type IntegrationConfig = {
    clover: {
        apiBase: string;
        merchantId: string;
        apiKey: string;
        environment: "sandbox" | "production";
    };
    ghl: {
        apiBase: string;
        locationId: string;
        pitToken: string;
        purchaseObjectSchemaKey: string | null;
    };
    supabase: {
        url: string;
        publishableKey: string;
        secretKey: string;
    };
};

/**
 * Read the integration configuration from environment variables.
 * Must be called inside a server-only execution boundary (.handler() body).
 * Throws a typed "SetupRequired" error listing what is missing so the UI can
 * render clear next steps instead of a generic 500.
 */
export function getIntegrationConfig(): IntegrationConfig {
    const missing: string[] = [];

    const cloverMerchantId = (process.env.CLOVER_MERCHANT_ID ?? "").trim();
    // Support both CLOVER_ACCESS_TOKEN (preferred) and legacy CLOVER_API_KEY
    const cloverApiKey = (process.env.CLOVER_ACCESS_TOKEN || process.env.CLOVER_API_KEY || "").trim();
    const ghlLocationId = (process.env.GHL_LOCATION_ID ?? "").trim();
    const ghlPitToken = (process.env.GHL_PIT_TOKEN ?? "").trim();
    const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim();
    const supabaseSecretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
    const supabasePublishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();

    if (!cloverMerchantId) missing.push("CLOVER_MERCHANT_ID");
    if (!cloverApiKey) missing.push("CLOVER_ACCESS_TOKEN");
    if (!ghlLocationId) missing.push("GHL_LOCATION_ID");
    if (!ghlPitToken) missing.push("GHL_PIT_TOKEN");
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY");
    if (!supabasePublishableKey) missing.push("SUPABASE_PUBLISHABLE_KEY");

    if (missing.length > 0) {
        const err = new Error(
            `Setup required: missing secrets (${missing.join(", ")}). Add them in the Secrets interface.`,
        );
        (err as Error & { setupRequired?: true }).setupRequired = true;
        (err as Error & { missing?: string[] }).missing = missing;
        throw err;
    }

    // Clover environment: "production" by default (matches the Madd Hatter
    // production merchant token). Set CLOVER_ENVIRONMENT=sandbox to use the
    // sandbox REST API host (apisandbox.dev.clover.com) with a sandbox test token.
    const cloverEnv: "sandbox" | "production" =
        (process.env.CLOVER_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
            ? "sandbox"
            : "production";

    return {
        clover: {
            // Production REST API host: https://api.clover.com
            // Sandbox REST API host:   https://apisandbox.dev.clover.com
            // (https://sandbox.dev.clover.com is the legacy Developer DASHBOARD, NOT the API host.)
            apiBase:
                cloverEnv === "sandbox" ? "https://apisandbox.dev.clover.com" : "https://api.clover.com",
            merchantId: cloverMerchantId,
            apiKey: cloverApiKey,
            environment: cloverEnv,
        },
        ghl: {
            // GHL REST API base (Lead Connector API v1).
            apiBase: "https://services.leadconnectorhq.com",
            locationId: ghlLocationId,
            pitToken: ghlPitToken,
            // The schema key / object ID for the "POS Purchase Item" custom object.
            // Defaults to the object ID from your settings URL (6aad9f812c282b1dfcb1c1b8)
            // or custom_objects.pos_purchase_item.
            purchaseObjectSchemaKey:
                process.env.GHL_PURCHASE_OBJECT_SCHEMA_KEY ??
                process.env.GHL_CUSTOM_OBJECT_ID ??
                "6aad9f812c282b1dfcb1c1b8",
        },
        supabase: {
            url: supabaseUrl,
            publishableKey: supabasePublishableKey,
            secretKey: supabaseSecretKey,
        },
    };
}

export class SetupRequiredError extends Error {
    missing: string[];
    constructor(missing: string[]) {
        super(`Setup required: missing secrets (${missing.join(", ")}).`);
        this.name = "SetupRequiredError";
        this.missing = missing;
    }
}

export function isSetupRequired(e: unknown): boolean {
    return (
        e instanceof SetupRequiredError ||
        (e instanceof Error && (e as Error & { setupRequired?: boolean }).setupRequired === true)
    );
}

export function getMissingSecrets(e: unknown): string[] {
    if (e instanceof SetupRequiredError) return e.missing;
    return (e as Error & { missing?: string[] }).missing ?? [];
}
