//
// Server-only admin authentication helpers using Supabase Auth + cookies.
// This module is imported only by server routes (src/routes/api/*) and by
// .functions.ts handlers (build replaces with RPC stubs on client). It never
// touches request/response mutation APIs that vary across TanStack versions —
// cookie setting happens in server route handlers via raw Response.
//
// NOTE: getRequest / getRequestHeader are documented by TanStack Start but are
// NOT exported by the installed version (1.168.x). We dynamic-import them
// inside getAdminSession so the build never sees a missing static export; if
// they are absent at runtime, getAdminSession returns null and callers fall
// back to the /api/auth/me route (which reads the cookie off the raw Request).
import { getIntegrationConfig } from "./config.server";
import { getSupabaseServer } from "./supabase.server";
import type { AdminSession } from "./types";

const SESSION_COOKIE_PREFIX = "sb-";
const SESSION_COOKIE_SUFFIX = "-auth-token";

/**
 * Parse all cookies out of a Cookie header string.
 */
function parseCookies(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of header.split(";")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq);
        const val = trimmed.slice(eq + 1);
        try {
            out[key] = decodeURIComponent(val);
        } catch {
            out[key] = val;
        }
    }
    return out;
}

/**
 * Find the Supabase session cookie in a Cookie header string, regardless
 * of the project ref embedded in the cookie name (sb-<ref>-auth-token).
 * Returns the access_token if present.
 */
function extractAccessToken(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = parseCookies(cookieHeader);
    for (const [name, value] of Object.entries(cookies)) {
        if (name.startsWith(SESSION_COOKIE_PREFIX) && name.endsWith(SESSION_COOKIE_SUFFIX)) {
            // Supabase stores the session as a JSON string in the cookie.
            try {
                const parsed = JSON.parse(value);
                if (parsed?.access_token) return parsed.access_token as string;
            } catch {
                // Some flows store the raw JWT directly.
                if (value.split(".").length === 3) return value;
            }
        }
    }
    return null;
}

/**
 * Verify a Supabase access token server-side using the secret key and return
 * the admin session (userId + email), or null if invalid.
 */
async function verifyToken(accessToken: string): Promise<AdminSession> {
    try {
        const sb = getSupabaseServer(); // uses SUPABASE_SECRET_KEY (server-only)
        const { data, error } = await sb.auth.getUser(accessToken);
        if (error || !data.user) return null;
        return { userId: data.user.id, email: data.user.email ?? "" };
    } catch (e) {
        // Log the error reason (never the token) so failures are diagnosable.
        console.error("[auth] token verification failed:", (e as Error)?.message ?? e);
        return null;
    }
}

/**
 * Resolve the admin session from an incoming Request's cookies. Used by
 * server routes (raw Request available).
 */
export async function getAdminSessionFromRequest(request: Request): Promise<AdminSession> {
    const accessToken = extractAccessToken(request.headers.get("cookie"));
    if (!accessToken) return null;
    return verifyToken(accessToken);
}

/**
 * Build a Set-Cookie header value for a Supabase session token pair.
 * The cookie name follows Supabase's sb-<ref>-auth-token convention.
 */
export function buildSessionCookie(accessToken: string, refreshToken: string): string {
    const cfg = getIntegrationConfig();
    const ref = cfg.supabase.url.replace("https://", "").split(".")[0];
    const value = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: 3600,
        user: null,
    });
    // SameSite=Lax for normal first-party navigation. When accessed via direct domain,
    // this is fully supported across all browsers. Secure is required on HTTPS.
    return `sb-${ref}-auth-token=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
}

export function buildLogoutCookie(): string {
    const cfg = getIntegrationConfig();
    const ref = cfg.supabase.url.replace("https://", "").split(".")[0];
    return `sb-${ref}-auth-token=${encodeURIComponent("")}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Get the admin session from within a server function handler by reading the
 * cookie from the runtime's request context.
 *
 * getRequest / getRequestHeader are documented by TanStack Start but are not
 * exported by the installed version (1.168.x). We dynamic-import them inside
 * the body so the client build never sees a missing static export. When they
 * are absent, this returns null and the caller falls back to the /api/auth/me
 * route, which reads the cookie directly off the raw Request object.
 */
export async function getAdminSession(): Promise<AdminSession> {
    try {
        let cookieHeader: string | null = null;

        // In TanStack Start v1, getRequest & getRequestHeader are exported from "@tanstack/react-start/server".
        try {
            const serverMod = await import("@tanstack/react-start/server");
            if (typeof serverMod.getRequestHeader === "function") {
                try {
                    cookieHeader = (serverMod.getRequestHeader("cookie") as string) ?? null;
                } catch {
                    cookieHeader = null;
                }
            }
            if (!cookieHeader && typeof serverMod.getRequest === "function") {
                try {
                    const req = serverMod.getRequest();
                    cookieHeader = req?.headers?.get?.("cookie") ?? null;
                } catch {
                    cookieHeader = null;
                }
            }
        } catch {
            // Fallback
        }

        if (!cookieHeader) {
            try {
                const mod: any = await import("@tanstack/react-start");
                const getHeader = mod.getRequestHeader ?? mod.getHeader;
                if (typeof getHeader === "function") {
                    cookieHeader = (getHeader("cookie") as string) ?? null;
                }
            } catch {
                // ignore
            }
        }

        if (!cookieHeader) return null;

        const accessToken = extractAccessToken(cookieHeader);
        if (!accessToken) return null;
        return verifyToken(accessToken);
    } catch (e) {
        console.error("[auth] getAdminSession error:", (e as Error)?.message ?? e);
        return null;
    }
}
