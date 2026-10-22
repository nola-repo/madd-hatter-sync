import { createFileRoute } from "@tanstack/react-router";
import {
  getAdminSessionFromRequest,
  getUserProfileServer,
  updateUserProfileServer,
} from "@/lib/integration/auth.server";

export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getAdminSessionFromRequest(request);
        if (!session) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const profile = await getUserProfileServer(session);
        return new Response(JSON.stringify({ ok: true, profile }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        const session = await getAdminSessionFromRequest(request);
        if (!session) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const body = await request.json();
          const res = await updateUserProfileServer(body, session);
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "Profile update failed" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }
      },
    },
  },
});
