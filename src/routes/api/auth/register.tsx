import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isSetupRequired, getMissingSecrets } from "@/lib/integration/config.server";
import { getSupabaseAnon, getSupabaseServer } from "@/lib/integration/supabase.server";
import { buildSessionCookie } from "@/lib/integration/auth.server";

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
          if (!data.session) {
            return new Response(JSON.stringify({ ok: true, requiresConfirmation: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }

          // Auto-insert row into admin_users (auto-approved for super admin)
          try {
            const sbAdmin = getSupabaseServer();
            await sbAdmin.from("admin_users").upsert({
              user_id: data.user.id,
              email: parsed.email.trim().toLowerCase(),
              approved: parsed.email.trim().toLowerCase() === "monzydave13@gmail.com",
            });
          } catch {
            // non-fatal if table does not exist yet
          }

          return new Response(JSON.stringify({ ok: true, requiresConfirmation: false }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": buildSessionCookie(
                data.session.access_token,
                data.session.refresh_token,
              ),
            },
          });
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
