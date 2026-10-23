// Thin server-function wrappers for the super-admin User Management page.
// Every handler verifies the caller is the super admin before acting.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession } from "./auth.server";
import { getSupabaseServer } from "./supabase.server";
import { isSuperAdminEmail } from "./super-admin";
import { sendAccountApprovedEmail } from "./registration-emails.server";

export type ManagedUser = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  approved: boolean;
  addedAt: string | null;
};

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true as const,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  };
}

/**
 * Resolve the current session and enforce that the caller is the super admin.
 * Throws a 401/403 Response (handled by the router) when not allowed.
 */
async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  if (!isSuperAdminEmail(session.email)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return session;
}

export const getSuperAdminStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const session = await getAdminSession();
    if (!session) return { setupRequired: false as const, isSuperAdmin: false, email: null };
    return {
      setupRequired: false as const,
      isSuperAdmin: isSuperAdminEmail(session.email),
      email: session.email,
    };
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});

export const listManagedUsers = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireSuperAdmin();
    const sb = getSupabaseServer();

    // Pull every auth user (admin API). listUsers returns up to 1000 per page.
    const users: Array<{
      id: string;
      email?: string;
      created_at?: string;
      last_sign_in_at?: string;
      user_metadata?: Record<string, unknown>;
    }> = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await sb.auth.admin.listUsers({ page });
      if (res.error) throw new Error(`listUsers: ${res.error.message}`);
      const batch = res.data.users ?? [];
      for (const u of batch) {
        users.push({
          id: u.id,
          email: u.email ?? undefined,
          created_at: u.created_at ?? undefined,
          last_sign_in_at: u.last_sign_in_at ?? undefined,
          user_metadata: u.user_metadata ?? undefined,
        });
      }
      if (batch.length < 1000) break;
      page += 1;
      if (page > 10) break; // hard cap to avoid runaway loops
    }

    // Pull the admin_users allowlist rows.
    const { data: allowRows, error: allowErr } = await sb
      .from("admin_users")
      .select("user_id, email, approved, created_at");
    if (allowErr) throw new Error(`admin_users: ${allowErr.message}`);
    const allowMap = new Map<string, { approved: boolean; created_at: string | null }>();
    for (const r of allowRows ?? []) {
      allowMap.set(r.user_id as string, {
        approved: !!r.approved,
        created_at: r.created_at ?? null,
      });
    }

    const merged: ManagedUser[] = users.map((u) => {
      const entry = allowMap.get(u.id);
      return {
        userId: u.id,
        email: u.email ?? "",
        fullName: (u.user_metadata?.["full_name"] as string | undefined) ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        approved: entry?.approved ?? false,
        addedAt: entry?.created_at ?? null,
      };
    });

    // Super admin first, then approved, then by created date desc.
    merged.sort((a, b) => {
      const aSuper = isSuperAdminEmail(a.email) ? 0 : 1;
      const bSuper = isSuperAdminEmail(b.email) ? 0 : 1;
      if (aSuper !== bSuper) return aSuper - bSuper;
      if (a.approved !== b.approved) return a.approved ? -1 : 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });

    return { setupRequired: false as const, users: merged };
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});

export const setUserApproval = createServerFn({ method: "POST" })
  .validator((data) => z.object({ userId: z.string().min(1), approved: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const session = await requireSuperAdmin();
      // Never let the super admin revoke themselves.
      if (data.userId === session.userId && !data.approved) {
        return {
          setupRequired: false as const,
          ok: false,
          error: "You cannot revoke your own access.",
        };
      }
      const sb = getSupabaseServer();
      // Look up the email + name for this user so the allowlist row stays
      // consistent and we can send the approval email.
      const u = await sb.auth.admin.getUserById(data.userId);
      const email = u.data?.user?.email ?? "";
      const fullName = (u.data?.user?.user_metadata?.["full_name"] as string | undefined) ?? "";
      const { error } = await sb.from("admin_users").upsert(
        {
          user_id: data.userId,
          email,
          approved: data.approved,
        },
        { onConflict: "user_id" },
      );
      if (error) return { setupRequired: false as const, ok: false, error: error.message };

      // When approving, send the "your account is approved" email to the user.
      // Awaited directly (static import) so it actually completes before the
      // response returns. The result is surfaced to the UI for diagnostics.
      let emailSent: "sent" | "failed" | "skipped" = "skipped";
      if (data.approved && email) {
        try {
          const ok = await sendAccountApprovedEmail({ userId: data.userId, email, fullName });
          emailSent = ok ? "sent" : "failed";
        } catch (e) {
          emailSent = "failed";
          console.error("[user-mgmt] approved email exception:", (e as Error)?.message ?? e);
        }
      }
      // If revoking, reset the approved-email dedup so a future re-approval
      // can send the notice again.
      if (!data.approved) {
        await sb
          .from("admin_users")
          .update({ approved_email_sent_at: null })
          .eq("user_id", data.userId)
          .then(
            () => {},
            () => {},
          );
      }

      return { setupRequired: false as const, ok: true, emailSent };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });

export const removeManagedUser = createServerFn({ method: "POST" })
  .validator((data) => z.object({ userId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    try {
      const session = await requireSuperAdmin();
      if (data.userId === session.userId) {
        return { setupRequired: false as const, ok: false, error: "You cannot remove yourself." };
      }
      const sb = getSupabaseServer();
      const { error } = await sb.from("admin_users").delete().eq("user_id", data.userId);
      if (error) return { setupRequired: false as const, ok: false, error: error.message };
      return { setupRequired: false as const, ok: true };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });
