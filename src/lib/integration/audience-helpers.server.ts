// Server-only helpers for the audience server functions. Kept in a separate
// module so tss-serverfn-split does not strip them from the .functions.ts
// wrapper (sibling declarations in a createServerFn module are erased).
import { getAdminSession } from "./auth.server";
import { getMissingSecrets, isSetupRequired } from "./config.server";
import { AUDIENCES } from "./audience-types.server";
import type { AudienceId } from "./audience-types.server";

const validIds = new Set(AUDIENCES.map((a) => a.id));

export function parseIds(arr: unknown): AudienceId[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is AudienceId => typeof x === "string" && validIds.has(x as AudienceId));
}

export function setupRequiredResponse(e: unknown) {
  return {
    setupRequired: true as const,
    missing: getMissingSecrets(e),
    message: (e as Error).message,
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export { isSetupRequired };
