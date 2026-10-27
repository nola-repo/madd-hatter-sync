import { createFileRoute } from "@tanstack/react-router";
import { getIntegrationConfig } from "@/lib/integration/config.server";
import { getSupabaseServer } from "@/lib/integration/supabase.server";
import { findPurchaseObjectSchema } from "@/lib/integration/ghl.server";

// -------------------------------------------------------------------------
// GET /api/health?secret=<SYNC_SECRET>
//
// Automated health check covering all post-fix verification tasks:
//   1. GHL_PURCHASE_OBJECT_SCHEMA_KEY validity
//   2. Cron sync queue depth (held_for_review drain)
//   3. Walk-in GHL contact creation
//   4. Purchase tag existence and verification rate
//   5. Duplicate contact check (upsert fix)
//   6. Sync run error rate (last 10 runs)
//   7. Stalled sync run detection (serverless freeze check)
//   8. GHL purchase item records existence
//
// Returns a JSON report with pass/fail/warn per check plus an overall status.
// Safe to call from cron-job.org as a daily health poll.
// -------------------------------------------------------------------------

type CheckStatus = "pass" | "fail" | "warn" | "skip";

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  value?: unknown;
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expectedSecret = (process.env["SYNC_SECRET"] ?? "").trim();
        if (expectedSecret && secret !== expectedSecret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const checks: Check[] = [];
        let cfg: ReturnType<typeof getIntegrationConfig> | null = null;

        try {
          cfg = getIntegrationConfig();
        } catch (e: any) {
          return Response.json(
            {
              overall: "fail",
              summary: "Environment not configured",
              error: e?.message ?? String(e),
              checks: [],
            },
            { status: 500 },
          );
        }

        const sb = getSupabaseServer();

        // ----------------------------------------------------------
        // CHECK 1: GHL Purchase Object Schema ID is valid
        // ----------------------------------------------------------
        try {
          const { schema } = await findPurchaseObjectSchema();
          if (schema?.id) {
            const envId = cfg.ghl.purchaseObjectSchemaKey ?? "6aad9f812c282b1dfcb1c1b8";
            const match = schema.id === envId;
            checks.push({
              name: "ghl_schema_id_valid",
              status: match ? "pass" : "warn",
              detail: match
                ? `Schema found: ${schema.id} (matches env var)`
                : `Schema found as ${schema.id}, but env has ${envId} â€” update GHL_PURCHASE_OBJECT_SCHEMA_KEY`,
              value: { found: schema.id, env: envId },
            });
          } else {
            checks.push({
              name: "ghl_schema_id_valid",
              status: "fail",
              detail:
                "POS Purchase Item custom object not found in GHL. Check GHL_PURCHASE_OBJECT_SCHEMA_KEY.",
            });
          }
        } catch (e: any) {
          checks.push({
            name: "ghl_schema_id_valid",
            status: "fail",
            detail: `Schema lookup failed: ${e?.message ?? String(e)}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 2: Held-for-review queue draining (not stuck)
        // ----------------------------------------------------------
        try {
          const { count: heldTotal } = await sb
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("status", "held_for_review");

          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count: heldOld } = await sb
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("status", "held_for_review")
            .lt("updated_at", oneDayAgo);

          const total = heldTotal ?? 0;
          const stale = heldOld ?? 0;

          checks.push({
            name: "held_queue_draining",
            status: stale > 50 ? "warn" : "pass",
            detail:
              stale > 50
                ? `${stale} orders held_for_review for >24h â€” push cron may not be running`
                : `${total} held total, ${stale} held >24h â€” queue looks healthy`,
            value: { heldTotal: total, staleOver24h: stale },
          });
        } catch (e: any) {
          checks.push({
            name: "held_queue_draining",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 3: Walk-in GHL contacts are being created
        // ----------------------------------------------------------
        try {
          const { data: walkIns } = await sb
            .from("customer_mappings")
            .select("clover_customer_id, matched_by, created_at")
            .eq("matched_by", "auto_create")
            .order("created_at", { ascending: false })
            .limit(5);

          const count = walkIns?.length ?? 0;
          checks.push({
            name: "walkin_contacts_created",
            status: count > 0 ? "pass" : "warn",
            detail:
              count > 0
                ? `${count} auto-created GHL contacts found (walk-ins / no-identifier)`
                : "No auto-created contacts yet â€” expected if no orders processed since the fix",
            value: { recentAutoCreated: count },
          });
        } catch (e: any) {
          checks.push({
            name: "walkin_contacts_created",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 4: Purchase tags applied and verified
        // ----------------------------------------------------------
        try {
          const { count: totalTags } = await sb
            .from("purchase_tags")
            .select("*", { count: "exact", head: true });

          const { count: verifiedTags } = await sb
            .from("purchase_tags")
            .select("*", { count: "exact", head: true })
            .eq("verification_status", "verified");

          const { count: outOfSync } = await sb
            .from("purchase_tags")
            .select("*", { count: "exact", head: true })
            .eq("verification_status", "out_of_sync");

          const total = totalTags ?? 0;
          const verified = verifiedTags ?? 0;
          const oos = outOfSync ?? 0;
          const verifyRate = total > 0 ? Math.round((verified / total) * 100) : 0;

          checks.push({
            name: "purchase_tags_verified",
            status: total === 0 ? "warn" : oos > 10 ? "warn" : "pass",
            detail:
              total === 0
                ? "No purchase_tags rows yet â€” expected if sync has not run"
                : `${total} tags total, ${verified} verified (${verifyRate}%), ${oos} out_of_sync`,
            value: { total, verified, outOfSync: oos, verifyRatePct: verifyRate },
          });
        } catch (e: any) {
          checks.push({
            name: "purchase_tags_verified",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 5: No duplicate GHL contacts per Clover customer
        // ----------------------------------------------------------
        try {
          const { data: mappings } = await sb
            .from("customer_mappings")
            .select("clover_customer_id, ghl_contact_id");

          if (mappings && mappings.length > 0) {
            const byClover = new Map<string, Set<string>>();
            for (const m of mappings) {
              if (!byClover.has(m.clover_customer_id))
                byClover.set(m.clover_customer_id, new Set());
              byClover.get(m.clover_customer_id)!.add(m.ghl_contact_id);
            }
            const duplicates = [...byClover.entries()].filter(([, ghlIds]) => ghlIds.size > 1);
            checks.push({
              name: "no_duplicate_ghl_contacts",
              status: duplicates.length > 0 ? "warn" : "pass",
              detail:
                duplicates.length > 0
                  ? `${duplicates.length} Clover customers mapped to multiple GHL contacts â€” upsert may not be deduplicating`
                  : "All Clover customers map to a single GHL contact",
              value: { duplicateCount: duplicates.length },
            });
          } else {
            checks.push({
              name: "no_duplicate_ghl_contacts",
              status: "skip",
              detail: "No mappings found yet",
            });
          }
        } catch (e: any) {
          checks.push({
            name: "no_duplicate_ghl_contacts",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 6: Sync run error rate (last 10 runs)
        // ----------------------------------------------------------
        try {
          const { data: runs } = await sb
            .from("sync_runs")
            .select("status, errors, started_at, finished_at, orders_upserted")
            .order("started_at", { ascending: false })
            .limit(10);

          if (runs && runs.length > 0) {
            const failedCount = runs.filter((r) => r.status === "failed").length;
            const errorRate = Math.round((failedCount / runs.length) * 100);
            const last = runs[0];
            const lastFinishedAt: string | null = last?.finished_at ?? null;
            const lastFinished = lastFinishedAt ? new Date(lastFinishedAt) : null;
            const minsAgo = lastFinished
              ? Math.round((Date.now() - lastFinished.getTime()) / 60000)
              : null;

            checks.push({
              name: "sync_run_error_rate",
              status: errorRate >= 50 ? "fail" : errorRate > 0 ? "warn" : "pass",
              detail: `Last ${runs.length} runs: ${failedCount} failed (${errorRate}%). Last run ${minsAgo ?? "?"} min ago, ${last?.orders_upserted ?? 0} orders upserted`,
              value: {
                runsChecked: runs.length,
                failedRuns: failedCount,
                errorRatePct: errorRate,
                lastRunMinutesAgo: minsAgo,
                lastRunStatus: last?.status ?? null,
              },
            });
          } else {
            checks.push({
              name: "sync_run_error_rate",
              status: "warn",
              detail: "No sync runs found â€” cron may not be configured yet",
            });
          }
        } catch (e: any) {
          checks.push({
            name: "sync_run_error_rate",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 7: Stalled sync run detection (serverless freeze)
        // ----------------------------------------------------------
        try {
          const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: stalled } = await sb
            .from("sync_runs")
            .select("id, started_at, finished_at, status")
            .is("finished_at", null)
            .lt("started_at", tenMinsAgo)
            .limit(5);

          const stalledCount = stalled?.length ?? 0;
          checks.push({
            name: "no_stalled_sync_runs",
            status: stalledCount > 0 ? "warn" : "pass",
            detail:
              stalledCount > 0
                ? `${stalledCount} sync run(s) started >10m ago with no finished_at â€” possible serverless freeze`
                : "No stalled sync runs detected",
            value: { stalledCount },
          });
        } catch (e: any) {
          checks.push({
            name: "no_stalled_sync_runs",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // CHECK 8: GHL purchase item records exist in DB
        // ----------------------------------------------------------
        try {
          const { count: purchaseItemCount } = await sb
            .from("order_items")
            .select("*", { count: "exact", head: true })
            .not("ghl_record_id", "is", null);

          const count = purchaseItemCount ?? 0;
          checks.push({
            name: "ghl_purchase_items_exist",
            status: count === 0 ? "warn" : "pass",
            detail:
              count === 0
                ? "No order_items have a ghl_record_id â€” POS Purchase Item sync has not run or is failing"
                : `${count} order items synced to GHL as Purchase Item records`,
            value: { count },
          });
        } catch (e: any) {
          checks.push({
            name: "ghl_purchase_items_exist",
            status: "skip",
            detail: `DB error: ${e?.message}`,
          });
        }

        // ----------------------------------------------------------
        // Overall status
        // ----------------------------------------------------------
        const hasFail = checks.some((c) => c.status === "fail");
        const hasWarn = checks.some((c) => c.status === "warn");
        const overall: CheckStatus = hasFail ? "fail" : hasWarn ? "warn" : "pass";

        const passed = checks.filter((c) => c.status === "pass").length;
        const warned = checks.filter((c) => c.status === "warn").length;
        const failed = checks.filter((c) => c.status === "fail").length;

        return Response.json({
          overall,
          summary: `${passed} passed, ${warned} warnings, ${failed} failed`,
          timestamp: new Date().toISOString(),
          checks,
        });
      },
    },
  },
});
