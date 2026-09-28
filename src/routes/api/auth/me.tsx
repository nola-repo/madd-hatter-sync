import { createFileRoute } from "@tanstack/react-router";
import { isSetupRequired, getMissingSecrets } from "@/lib/integration/config.server";
import { getAdminSessionFromRequest } from "@/lib/integration/auth.server";

export const Route = createFileRoute("/api/auth/me")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const session = await getAdminSessionFromRequest(request);
                    return new Response(JSON.stringify({ setupRequired: false, session }), {
                        status: 200,
                        headers: { "content-type": "application/json" },
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
                    return new Response(JSON.stringify({ setupRequired: false, session: null }), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    });
                }
            },
        },
    },
});
