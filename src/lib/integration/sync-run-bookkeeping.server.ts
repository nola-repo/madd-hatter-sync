//
// Server-only: sync_runs bookkeeping.
//
// Extracted from ingestion.server.ts so the run record can be closed from a
// try/catch safeguard. createSyncRun() inserts a "running" row; finishSyncRun()
// writes the final status + counters. The caller (refreshPosData) wraps its
// work in try/catch so a mid-loop abort still marks the run "failed" instead
// of leaving it stuck at "running" with orders_upserted=0.
import { getSupabaseServer } from "./supabase.server";

export async function createSyncRun(
  merchantId: string,
  kind: string,
  rangeStart?: number,
  rangeEnd?: number,
) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("sync_runs")
    .insert({
      clover_merchant_id: merchantId,
      kind,
      status: "running",
      range_start: rangeStart ?? null,
      range_end: rangeEnd ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`create sync_run: ${error.message}`);
  return data;
}

export async function finishSyncRun(runId: string, patch: Record<string, any>) {
  const sb = getSupabaseServer();
  const row: Record<string, any> = {
    finished_at: new Date().toISOString(),
  };

  if (patch["status"] !== undefined) row["status"] = patch["status"];
  if (patch["errors"] !== undefined) row["errors"] = patch["errors"];
  if (patch["ordersFetched"] !== undefined) row["orders_fetched"] = patch["ordersFetched"];
  if (patch["ordersUpserted"] !== undefined) row["orders_upserted"] = patch["ordersUpserted"];
  if (patch["orderItemsFetched"] !== undefined)
    row["order_items_fetched"] = patch["orderItemsFetched"];
  if (patch["orderItemsUpserted"] !== undefined)
    row["order_items_upserted"] = patch["orderItemsUpserted"];
  if (patch["customersFetched"] !== undefined) row["customers_fetched"] = patch["customersFetched"];
  if (patch["customersUpserted"] !== undefined)
    row["customers_upserted"] = patch["customersUpserted"];
  if (patch["paymentsFetched"] !== undefined) row["payments_fetched"] = patch["paymentsFetched"];
  if (patch["paymentsUpserted"] !== undefined) row["payments_upserted"] = patch["paymentsUpserted"];
  if (patch["productsFetched"] !== undefined) row["products_fetched"] = patch["productsFetched"];
  if (patch["productsUpserted"] !== undefined) row["products_upserted"] = patch["productsUpserted"];
  if (patch["categoriesFetched"] !== undefined)
    row["categories_fetched"] = patch["categoriesFetched"];
  if (patch["categoriesUpserted"] !== undefined)
    row["categories_upserted"] = patch["categoriesUpserted"];
  if (patch["employeesFetched"] !== undefined) row["employees_fetched"] = patch["employeesFetched"];
  if (patch["employeesUpserted"] !== undefined)
    row["employees_upserted"] = patch["employeesUpserted"];
  if (patch["modifiersFetched"] !== undefined) row["modifiers_fetched"] = patch["modifiersFetched"];
  if (patch["discountsFetched"] !== undefined) row["discounts_fetched"] = patch["discountsFetched"];
  if (patch["crmOrdersSynced"] !== undefined) row["crm_orders_synced"] = patch["crmOrdersSynced"];
  if (patch["crmOrdersHeld"] !== undefined) row["crm_orders_held"] = patch["crmOrdersHeld"];
  if (patch["crmOrdersErrors"] !== undefined) row["crm_orders_errors"] = patch["crmOrdersErrors"];
  if (patch["crmContactsCreated"] !== undefined)
    row["crm_contacts_created"] = patch["crmContactsCreated"];
  if (patch["crmPurchaseRecordsCreated"] !== undefined)
    row["crm_purchase_records_created"] = patch["crmPurchaseRecordsCreated"];

  const { error } = await sb.from("sync_runs").update(row).eq("id", runId);
  if (error) {
    console.warn(`[sync_runs] Failed to update run ${runId}:`, error.message);
  }
}
