//
// Server-only V2 contact upsert for the bulk customer backfill pipeline.
//
// Uses Version: 2021-04-15 (the documented version for the v2 upsert surface)
// with the channelId (Location ID) header required for subaccount PITs.
// Performs search-then-upsert: first look up by email/phone, and only create
// a new contact when no confident match exists. Idempotent — a successful
// response always returns the existing or newly created contact id.
//
import {
  ghlFetch,
  searchContactsByEmail,
  searchContactsByPhone,
  mapContact,
  type GhlContact,
} from "./ghl.server";
import { getIntegrationConfig } from "./config.server";

export type UpsertResult = {
  id: string;
  method: "matched" | "created";
  contact: GhlContact;
};

/**
 * V2 contact upsert. Returns the resolved contact id + method.
 * Throws a flagged CONFLICT error if email and phone point to different contacts.
 */
export async function upsertGhlContactV2(input: {
  cloverCustomerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<UpsertResult> {
  const cfg = getIntegrationConfig();
  const emailMatches = input.email ? await searchContactsByEmail(input.email) : [];
  const phoneMatches = input.phone ? await searchContactsByPhone(input.phone) : [];

  // Identity conflict: email and phone point to DIFFERENT contacts.
  if (emailMatches.length > 0 && phoneMatches.length > 0) {
    const phoneIds = new Set(phoneMatches.map((c) => c.id));
    const emailOnly = emailMatches.filter((c) => !phoneIds.has(c.id));
    if (emailOnly.length > 0) {
      const err = new Error(
        `CONFLICT: email matches ${emailOnly[0].id} but phone matches a different contact.`,
      ) as Error & {
        conflict?: true;
        emailContactId?: string;
        phoneContactId?: string;
      };
      err.conflict = true;
      err.emailContactId = emailOnly[0].id;
      err.phoneContactId = phoneMatches[0].id;
      throw err;
    }
  }

  // Reuse an existing confident match if exactly one matches on either id.
  const confident =
    emailMatches.length === 1
      ? emailMatches[0]
      : phoneMatches.length === 1
        ? phoneMatches[0]
        : null;
  if (confident) {
    return { id: confident.id, method: "matched", contact: confident };
  }

  // No existing match — create via V2 upsert (Version 2021-04-15).
  const body: Record<string, any> = {
    locationId: cfg.ghl.locationId,
    tags: ["Clover POS Customer"],
    source: "Clover POS Backfill",
  };
  if (input.firstName) body["firstName"] = input.firstName;
  if (input.lastName) body["lastName"] = input.lastName;
  if (input.email) body["email"] = input.email;
  if (input.phone) body["phone"] = input.phone;

  const json = await ghlFetch(
    `/contacts/upsert`,
    { method: "POST", body: JSON.stringify(body) },
    "2021-04-15",
  );
  const c = json?.contact ?? json?.contacts?.[0] ?? json;
  const contact = mapContact({ id: c.id, ...c });
  return { id: contact.id, method: "created", contact };
}
