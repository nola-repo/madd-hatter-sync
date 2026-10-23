// Thin server-function wrapper that checks the admin allowlist.
import { createServerFn } from "@tanstack/react-start";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession } from "./auth.server";
import { getSupabaseServer } from "./supabase.server";
import { isSuperAdminEmail } from "./super-admin";

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true as const,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  };
}

/**
 * Returns whether the currently signed-in user is on the approved admin
 * allowlist. A signed-in but unapproved user must be shown the "pending
 * approval" screen instead of the admin pages.
 */
export const checkAdminApproval = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const session = await getAdminSession();
    if (!session) {
      return { setupRequired: false as const, approved: false, signedIn: false };
    }

    // Super admin is always automatically approved without manual SQL needed
    if (isSuperAdminEmail(session.email)) {
      return { setupRequired: false as const, approved: true, signedIn: true };
    }

    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("admin_users")
      .select("approved")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (error) {
      // If the allowlist table is missing, fail closed (treat as unapproved)
      // so we never accidentally grant access. Log server-side only.
      console.error("[auth] allowlist check failed:", error.message);
      return { setupRequired: false as const, approved: false, signedIn: true };
    }
    return {
      setupRequired: false as const,
      approved: !!data?.approved,
      signedIn: true,
    };
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});
