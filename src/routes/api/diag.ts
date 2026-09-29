import { createFileRoute } from "@tanstack/react-router";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getAdminSessionFromRequest } from "@/lib/integration/auth.server";
import { searchContactsByEmail, searchContactsByPhone } from "@/lib/integration/ghl.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";

// Shared header builder. channelId (Location ID) is REQUIRED for subaccount
// Private Integration Tokens — omitting it causes silent 401/403 rejections
// on scoped endpoints.
function ghlHeaders(
  extra: Record<string, string> = {},
  version = "2021-07-28",
): Record<string, string> {
  const cfg = getIntegrationConfig();
  return {
    Authorization: `Bearer ${cfg.ghl.pitToken?.trim() ?? ""}`,
    Version: version,
    channelId: cfg.ghl.locationId,
    Accept: "application/json",
    ...extra,
  };
}

export const Route = createFileRoute("/api/diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const allowDebug =
            url.searchParams.get("debug") === "1" || url.searchParams.get("check") === "1";
          if (!allowDebug) {
            const session = await getAdminSessionFromRequest(request);
            if (!session) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
          }

          const cfg = getIntegrationConfig();

          // 1. Test location endpoint
          const locRes = await fetch(`${cfg.ghl.apiBase}/locations/${cfg.ghl.locationId}`, {
            headers: ghlHeaders(),
          });
          const locText = await locRes.text();

          // 2. Test contacts list endpoint
          const contactsRes = await fetch(
            `${cfg.ghl.apiBase}/contacts/?locationId=${cfg.ghl.locationId}&limit=10`,
            {
              headers: ghlHeaders(),
            },
          );
          const contactsText = await contactsRes.text();

          // 2b. Test Custom Objects Schema & Records endpoints.
          // Schema endpoints use GET. Records endpoints are POST-only — a GET
          // on a POST-only endpoint returns a false-positive 404. To test
          // reachability WITHOUT creating a record, POST a minimal body
          // (locationId only, no properties) which yields 422 (reachable but
          // invalid) vs 404 (wrong path/token).
          const schemaGetEndpoints = [
            `${cfg.ghl.apiBase}/objects/?locationId=${cfg.ghl.locationId}`,
            `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item?locationId=${cfg.ghl.locationId}`,
          ];
          const recordsPostEndpoints = [
            `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item/records`,
            `${cfg.ghl.apiBase}/objects/6aad9f812c282b1dfcb1c1b8/records`,
          ];

          const testObjResults: any[] = [];
          // GET schema endpoints
          for (const u of schemaGetEndpoints) {
            try {
              const r = await fetch(u, { headers: ghlHeaders({}, "2021-07-28") });
              const t = await r.text();
              testObjResults.push({
                method: "GET",
                url: u.replace(cfg.ghl.apiBase, ""),
                status: r.status,
                bodySample: t.slice(0, 250),
              });
            } catch (err: any) {
              testObjResults.push({
                method: "GET",
                url: u.replace(cfg.ghl.apiBase, ""),
                error: err.message,
              });
            }
          }
          // POST records endpoints (minimal body → 422 = reachable, no record created)
          for (const u of recordsPostEndpoints) {
            try {
              const r = await fetch(u, {
                method: "POST",
                headers: ghlHeaders({ "Content-Type": "application/json" }, "2021-07-28"),
                body: JSON.stringify({ locationId: cfg.ghl.locationId }),
              });
              const t = await r.text();
              testObjResults.push({
                method: "POST",
                url: u.replace(cfg.ghl.apiBase, ""),
                status: r.status,
                bodySample: t.slice(0, 250),
              });
            } catch (err: any) {
              testObjResults.push({
                method: "POST",
                url: u.replace(cfg.ghl.apiBase, ""),
                error: err.message,
              });
            }
          }

          // 3. Test contacts search endpoint
          const searchRes = await fetch(
            `${cfg.ghl.apiBase}/contacts/search?locationId=${cfg.ghl.locationId}&query=test`,
            {
              headers: ghlHeaders(),
            },
          );
          const searchText = await searchRes.text();

          // 4. Sample real Clover customers from Supabase
          const sb = getSupabaseServer();
          const { data: sampleCustomers } = await sb
            .from("customers")
            .select("clover_customer_id, first_name, last_name, email, phone")
            .not("email", "is", null)
            .limit(10);

          // 5. Test searching GHL for sample customers
          const testResults: any[] = [];
          for (const cust of (sampleCustomers ?? []).slice(0, 5)) {
            let emailRes: any[] = [];
            let phoneRes: any[] = [];
            if (cust.email) {
              emailRes = await searchContactsByEmail(cust.email);
            }
            if (cust.phone) {
              phoneRes = await searchContactsByPhone(cust.phone);
            }
            testResults.push({
              cust,
              emailFoundCount: emailRes.length,
              phoneFoundCount: phoneRes.length,
              emailResSample: emailRes.slice(0, 2),
              phoneResSample: phoneRes.slice(0, 2),
            });
          }

          return Response.json({
            success: true,
            configuredLocationId: cfg.ghl.locationId,
            locationCheck: {
              status: locRes.status,
              bodySample: locText.slice(0, 300),
            },
            contactsListCheck: {
              status: contactsRes.status,
              bodySample: contactsText.slice(0, 300),
            },
            customObjectsRecordsCheck: {
              endpoints: testObjResults,
            },
            contactsSearchCheck: {
              status: searchRes.status,
              bodySample: searchText.slice(0, 300),
            },
            sampleCustomerSearchTests: testResults,
          });
        } catch (e: any) {
          return Response.json(
            { error: e?.message ?? String(e), stack: e?.stack },
            { status: 500 },
          );
        }
      },
    },
  },
});
