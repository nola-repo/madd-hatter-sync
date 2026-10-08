import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isSetupRequired, getMissingSecrets } from "@/lib/integration/config.server";
import { getSupabaseAnon, getSupabaseServer } from "@/lib/integration/supabase.server";
import { buildSessionCookie } from "@/lib/integration/auth.server";
import { isSuperAdminEmail } from "@/lib/integration/super-admin";
import { sendRegistrationNotifications } from "@/lib/integration/registration-emails.server";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = z
            .object({
              fullName: z.string().min(1).max(120),
              email: z.string().email(),
              password: z.string().min(8),
            })
            .parse(body);

          const emailLower = parsed.email.trim().toLowerCase();
          const isSuperAdmin = isSuperAdminEmail(emailLower);

          const sb = getSupabaseAnon();
          const { data, error } = await sb.auth.signUp({
            email: parsed.email,
            password: parsed.password,
            options: { data: { full_name: parsed.fullName } },
          });

          if (error) {
            return new Response(
              JSON.stringify({ ok: false, error: error.message ?? "Registration failed" }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }

          // If email confirmation is required, no session is returned.
          const requiresConfirmation = !data.session;
          const userId = data.user?.id;

          // Auto-insert row into admin_users (auto-approved for super admin).
          if (userId) {
            try {
              const sbAdmin = getSupabaseServer();
              await sbAdmin.from("admin_users").upsert(
                {
                  user_id: userId,
                  email: emailLower,
                  approved: isSuperAdmin,
                },
                { onConflict: "user_id" },
              );
            } catch (e: any) {
              console.warn("[register] admin_users upsert warning:", e?.message ?? e);
            }
          }

          // Send registration notifications (welcome to user + alert to super
          // admin) for non-super-admin registrations. Awaited directly.
          if (!isSuperAdmin) {
            try {
              const outcome = await sendRegistrationNotifications({
                userId: userId ?? emailLower,
                email: parsed.email,
                fullName: parsed.fullName,
                requiresConfirmation,
              });
              console.log("[register] notifications sent:", outcome);
            } catch (e: any) {
              console.error("[register] notification send exception:", e?.message ?? e);
            }
          }

          // Always signal "pending approval" for non-super-admin users so the
          // client routes to /pending-approval. Super admin goes straight in.
          if (isSuperAdmin && data.session) {
            return new Response(
              JSON.stringify({ ok: true, requiresConfirmation: false, pendingApproval: false }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                  "set-cookie": buildSessionCookie(
                    data.session.access_token,
                    data.session.refresh_token,
                  ),
                },
              },
            );
          }

          if (requiresConfirmation) {
            return new Response(
              JSON.stringify({ ok: true, requiresConfirmation: true, pendingApproval: true }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }

          // Immediate session but not super admin: set the session cookie so
          // the user is signed in, then route them to pending-approval.
          return new Response(
            JSON.stringify({ ok: true, requiresConfirmation: false, pendingApproval: true }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
                "set-cookie": data.session
                  ? buildSessionCookie(data.session.access_token, data.session.refresh_token)
                  : "",
              },
            },
          );
        } catch (e: any) {
          if (isSetupRequired(e)) {
            return new Response(
              JSON.stringify({
                setupRequired: true,
                missing: getMissingSecrets(e),
                message: e.message,
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "Registration failed" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
