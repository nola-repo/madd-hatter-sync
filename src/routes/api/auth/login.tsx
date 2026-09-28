import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isSetupRequired, getMissingSecrets } from "@/lib/integration/config.server";
import { getSupabaseAnon } from "@/lib/integration/supabase.server";
import { buildSessionCookie } from "@/lib/integration/auth.server";

export const Route = createFileRoute("/api/auth/login")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const body = await request.json();
                    const parsed = z
                        .object({ email: z.string().email(), password: z.string().min(1) })
                        .parse(body);
                    const sb = getSupabaseAnon();
                    const { data, error } = await sb.auth.signInWithPassword({
                        email: parsed.email,
                        password: parsed.password,
                    });
                    if (error || !data.session) {
                        return new Response(
                            JSON.stringify({ ok: false, error: error?.message ?? "Login failed" }),
                            { status: 200, headers: { "content-type": "application/json" } },
                        );
                    }
                    return new Response(JSON.stringify({ ok: true }), {
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
                    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "Login failed" }), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    });
                }
            },
        },
    },
});
