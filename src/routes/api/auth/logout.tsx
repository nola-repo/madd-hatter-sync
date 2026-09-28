import { createFileRoute } from "@tanstack/react-router";
import { buildLogoutCookie } from "@/lib/integration/auth.server";

export const Route = createFileRoute("/api/auth/logout")({
    server: {
        handlers: {
            POST: async () => {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                        "set-cookie": buildLogoutCookie(),
                    },
                });
            },
        },
    },
});
