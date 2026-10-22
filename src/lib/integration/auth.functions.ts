import { createServerFn } from "@tanstack/react-start";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession, getUserProfileServer, updateUserProfileServer } from "./auth.server";

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

export const getUserProfile = createServerFn({ method: "GET" }).handler(async () => {
    try {
        const profile = await getUserProfileServer();
        return { ok: true, profile };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Failed to fetch user profile" };
    }
});

export const updateUserProfile = createServerFn({ method: "POST" })
    .validator(
        (d: {
            fullName?: string;
            timezone?: string;
            syncAlerts?: boolean;
            reconciliationDigest?: boolean;
            tagAuditWarnings?: boolean;
            newPassword?: string;
        }) => d,
    )
    .handler(async ({ data }) => {
        try {
            return await updateUserProfileServer(data);
        } catch (e: any) {
            return { ok: false, error: e?.message ?? "Failed to update profile" };
        }
    });

