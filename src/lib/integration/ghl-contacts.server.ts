//
// Server-only: GHL contact operations (create/upsert + lookup).
// Extracted from ghl.server.ts to keep that file focused on custom objects.
//
// IMPORTANT: Uses the official Upsert Contact endpoint so GHL deduplicates on
// email/phone based on the subaccount's "Allow Duplicate Contact" settings.
import { getIntegrationConfig } from "./config.server";
import { ghlRequest } from "./ghl.server";

export type GhlContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export function mapContact(c: any): GhlContact {
  return {
    id: c.id,
    firstName: c.firstName ?? c.contact?.firstName ?? "",
    lastName: c.lastName ?? c.contact?.lastName ?? "",
    email: c.email ?? c.contact?.email ?? "",
    phone: c.phone ?? c.contact?.phone ?? "",
  };
}

export async function createGhlContact(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note?: string;
}): Promise<GhlContact> {
  const cfg = getIntegrationConfig();
  const body: Record<string, any> = {
    locationId: cfg.ghl.locationId,
    tags: ["Clover POS Customer"],
    source: "Clover POS",
  };
  if (input.firstName) body["firstName"] = input.firstName;
  if (input.lastName) body["lastName"] = input.lastName;
  if (input.email) body["email"] = input.email;
  if (input.phone) body["phone"] = input.phone;

  // Upsert Contact endpoint — GHL dedupes on email/phone automatically.
  const json = await ghlFetch(`/contacts/upsert`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const c = json?.contact ?? json?.contacts?.[0] ?? json;
  return mapContact({ id: c.id, ...c });
}

// Re-export lookup functions that remain in ghl.server.ts for a stable import surface.
export { searchContactsByEmail, searchContactsByPhone, searchContactsByName } from "./ghl.server";
