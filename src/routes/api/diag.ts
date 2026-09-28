import { createFileRoute } from "@tanstack/react-router";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getAdminSessionFromRequest } from "@/lib/integration/auth.server";
import { searchContactsByEmail, searchContactsByPhone } from "@/lib/integration/ghl.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";

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
                    const rawToken = cfg.ghl.pitToken?.trim() ?? "";

                    // 1. Test location endpoint
                    const locRes = await fetch(`${cfg.ghl.apiBase}/locations/${cfg.ghl.locationId}`, {
                        headers: {
                            Authorization: `Bearer ${rawToken}`,
                            Version: "2021-07-28",
                            Accept: "application/json",
                        },
                    });
                    const locText = await locRes.text();

                    // 2. Test contacts list endpoint
                    const contactsRes = await fetch(
                        `${cfg.ghl.apiBase}/contacts/?locationId=${cfg.ghl.locationId}&limit=10`,
                        {
                            headers: {
                                Authorization: `Bearer ${rawToken}`,
                                Version: "2021-07-28",
                                Accept: "application/json",
                            },
                        },
                    );
                    const contactsText = await contactsRes.text();

                    // 2b. Test Custom Objects Schema & Records endpoints to find exact key/status
                    const endpointsToTest = [
                        // Schema search / list
                        `${cfg.ghl.apiBase}/objects/?locationId=${cfg.ghl.locationId}`,
                        `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item?locationId=${cfg.ghl.locationId}`,
                        // Record endpoint tests
                        `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item/records?locationId=${cfg.ghl.locationId}`,
                        `${cfg.ghl.apiBase}/objects/records?locationId=${cfg.ghl.locationId}&schemaKey=custom_objects.pos_purchase_item`,
                        `${cfg.ghl.apiBase}/objects/records?locationId=${cfg.ghl.locationId}&schemaId=6aad9f812c282b1dfcb1c1b8`,
                        `${cfg.ghl.apiBase}/objects/6aad9f812c282b1dfcb1c1b8/records?locationId=${cfg.ghl.locationId}`,
                    ];

                    const testObjResults: any[] = [];
                    for (const u of endpointsToTest) {
                        try {
                            const r = await fetch(u, {
                                headers: {
                                    Authorization: `Bearer ${rawToken}`,
                                    Version: "v3",
                                    Accept: "application/json",
                                },
                            });
                            const t = await r.text();
                            testObjResults.push({
                                url: u.replace(cfg.ghl.apiBase, ""),
                                status: r.status,
                                bodySample: t.slice(0, 250),
                            });
                        } catch (err: any) {
                            testObjResults.push({ url: u.replace(cfg.ghl.apiBase, ""), error: err.message });
                        }
                    }

                    // 3. Test contacts search endpoint
                    const searchRes = await fetch(
                        `${cfg.ghl.apiBase}/contacts/search?locationId=${cfg.ghl.locationId}&query=test`,
                        {
                            headers: {
                                Authorization: `Bearer ${rawToken}`,
                                Version: "2021-07-28",
                                Accept: "application/json",
                            },
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
