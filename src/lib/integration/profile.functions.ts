// Thin server-function wrappers for the profile page.
// Reads the admin session (incl. user_metadata) and updates user metadata.
import { createServerFn } from "@tanstack/react-start";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession } from "./auth.server";
import { getSupabaseServer } from "./supabase.server";

export type ProfileData = {
  setupRequired: false;
  userId: string;
  email: string;
  fullName: string | null;
  nickname: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type ProfileUpdateInput = {
  fullName: string;
  nickname: string;
};

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true as const,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  };
}

async function requireSession() {
  const session = await getAdminSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export const getProfile = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const session = await requireSession();
    const sb = getSupabaseServer();
    const { data, error } = await sb.auth.admin.getUserById(session.userId);
    if (error || !data.user) {
      // Fall back to session-only data.
      return {
        setupRequired: false as const,
        userId: session.userId,
        email: session.email,
        fullName: null,
        nickname: null,
        createdAt: null,
        lastSignInAt: null,
      } satisfies ProfileData;
    }
    const u = data.user;
    return {
      setupRequired: false as const,
      userId: u.id,
      email: u.email ?? "",
      fullName: (u.user_metadata?.["full_name"] as string | undefined) ?? null,
      nickname: (u.user_metadata?.["nickname"] as string | undefined) ?? null,
      createdAt: u.created_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
    } satisfies ProfileData;
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});

export const updateProfile = createServerFn({ method: "POST" })
  .validator((data: ProfileUpdateInput) => data)
  .handler(async ({ data }) => {
    try {
      const session = await requireSession();
      const sb = getSupabaseServer();
      const { error } = await sb.auth.admin.updateUserById(session.userId, {
        user_metadata: {
          full_name: data.fullName,
          nickname: data.nickname,
        },
      });
      if (error) {
        return { setupRequired: false as const, ok: false, error: error.message };
      }
      return { setupRequired: false as const, ok: true };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });
