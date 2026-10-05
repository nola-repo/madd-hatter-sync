//
// Thin server-function wrapper for the slim provider status check.
// Returns only { provider, status } for Clover and GHL — no payloads,
// tokens, URLs or error bodies are ever sent to the client.
import { createServerFn } from "@tanstack/react-start";
import { checkCloverConnection } from "./clover.server";
import { checkGhlConnection } from "./ghl.server";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { getAdminSession } from "./auth.server";
import type { ProviderStatus } from "./types";

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  } as const;
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

export const getProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  try {
    // Run both checks in parallel; a failure of one never affects the other.
    const [cloverRes, ghlRes] = await Promise.allSettled([
      checkCloverConnection(),
      checkGhlConnection(),
    ]);

    const providers: ProviderStatus[] = [
      {
        provider: "clover",
        status:
          cloverRes.status === "fulfilled" && cloverRes.value.connected ? "connected" : "error",
      },
      {
        provider: "ghl",
        status: ghlRes.status === "fulfilled" && ghlRes.value.connected ? "connected" : "error",
      },
    ];

    return { setupRequired: false as const, providers };
  } catch (e) {
    if (isSetupRequired(e)) return setupRequiredResponse(e);
    throw e;
  }
});
