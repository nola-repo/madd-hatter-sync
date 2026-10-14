// Server function wrappers for the audience builder. Thin wrappers only —
// all runtime logic lives in the imported .server.ts modules.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminSession } from "./auth.server";
import { isSetupRequired, getMissingSecrets } from "./config.server";
import { AUDIENCES } from "./audience-types.server";
import type { AudienceId } from "./audience-types.server";
import { buildAudience, type AudienceResult } from "./audience-build.server";

const validIds = new Set(AUDIENCES.map((a) => a.id));
function parseIds(arr: unknown): AudienceId[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is AudienceId => typeof x === "string" && validIds.has(x as AudienceId));
}

function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true as const,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  };
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export const getAudienceCatalogFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return { audiences: AUDIENCES };
});

export const buildAudienceFn = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        andAudiences: z.array(z.string()).default([]),
        orGroups: z.array(z.array(z.string())).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    try {
      const result: AudienceResult = await buildAudience(
        parseIds(data.andAudiences),
        data.orGroups.map((g) => parseIds(g)),
      );
      return { setupRequired: false as const, result };
    } catch (e) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      throw e;
    }
  });
