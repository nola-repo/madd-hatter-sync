//
// Thin server-function wrappers for admin auth.
// Login and logout set cookies, so they go through the raw API routes
// (/api/auth/login, /api/auth/logout) which own the Set-Cookie header
// directly. Only `adminMe` lives here — it only READS the session.
import { createServerFn } from "@tanstack/react-start";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession } from "./auth.server";

function setupRequiredResponse(e: unknown) {
    return {
        setupRequired: true,
        missing: getMissingSecrets(e),
        message: (e as Error).message,
    } as const;
}

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
    try {
        const session = await getAdminSession();
        return { setupRequired: false as const, session };
    } catch (e) {
        if (isSetupRequired(e)) return setupRequiredResponse(e);
        throw e;
    }
});
