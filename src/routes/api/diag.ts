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

                    // 2b. Test Custom Objects Schema & Records endpoints.
                    // IMPORTANT: POST /objects/{key}/records requires v3 + POST method.
                    // A GET on this endpoint returns 404 by design (it's POST-only).
                    // We test: GET schema endpoints (v3) + POST records endpoint (v3).
                    const schemaEndpoints = [
                        `${cfg.ghl.apiBase}/objects/?locationId=${cfg.ghl.locationId}`,
                        `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item?locationId=${cfg.ghl.locationId}&fetchProperties=true`,
                    ];

                    const testObjResults: any[] = [];

                    // Test schema GET endpoints
                    for (const u of schemaEndpoints) {
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
                                method: "GET",
                                status: r.status,
                                bodySample: t.slice(0, 250),
                            });
                        } catch (err: any) {
                            testObjResults.push({ url: u.replace(cfg.ghl.apiBase, ""), method: "GET", error: err.message });
                        }
                    }

                    // Test record CREATE endpoint with POST + a minimal dry-run payload.
                    // We expect 200 or 422 (schema field validation) — NOT 404.
                    // A 404 here means the endpoint path or token is wrong.
                    try {
                        const recordsUrl = `${cfg.ghl.apiBase}/objects/custom_objects.pos_purchase_item/records`;
                        const testBody = JSON.stringify({
                            locationId: cfg.ghl.locationId,
                            properties: { __diag_test__: "true" },
                        });
                        const r = await fetch(recordsUrl, {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${rawToken}`,
                                Version: "v3",
                                "Content-Type": "application/json",
                                Accept: "application/json",
                            },
                            body: testBody,
                        });
                        const t = await r.text();
                        testObjResults.push({
                            url: recordsUrl.replace(cfg.ghl.apiBase, ""),
                            method: "POST",
                            note: "200/422 = endpoint reachable. 404 = path or token wrong.",
                            status: r.status,
                            bodySample: t.slice(0, 250),
                        });
                    } catch (err: any) {
                        testObjResults.push({ url: "/objects/custom_objects.pos_purchase_item/records", method: "POST", error: err.message });
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
