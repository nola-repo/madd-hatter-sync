// Server function wrappers for the audience builder. Thin wrappers only —
// all runtime logic lives in the imported .server.ts modules.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AUDIENCES } from "./audience-types.server";
import { buildAudience, type AudienceResult } from "./audience-build.server";
import {
  parseIds,
  setupRequiredResponse,
  requireAdmin,
  isSetupRequired,
} from "./audience-helpers.server";

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
    } catch (e: unknown) {
      if (isSetupRequired(e)) return setupRequiredResponse(e);
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Audience build error:", msg, e);
      return {
        setupRequired: false as const,
        error: msg || "Failed to evaluate audience.",
        result: null,
      };
    }
  });
