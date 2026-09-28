//
// Server-only: batch sync of paid Clover orders to GHL POS Purchase Item records.
// Moved out of integration.functions.ts so the server-function wrapper stays thin.
import { getSupabaseServer } from "./supabase.server";
import { syncOrderToGhl } from "./sync.server";

export type SyncAllPaidResult = {
    totalOrders: number;
    syncedOrders: number;
    recordsCreated: number;
    errors: number;
    failedOrders: Array<{ orderId: string; error: string }>;
};

/**
 * Sync up to `limit` paid orders to GHL POS Purchase Item custom object records.
 *
 * Reads the REAL SyncResult shape from syncOrderToGhl:
 *   - `outcome` ("synced" | "partial" | "error" | "skipped" | "held_for_review")
 *   - `purchaseRecordIds` (string[])
 *
 * Previously this read `res.status` / `res.purchaseRecordsCreated`, which do not
 * exist on SyncResult — every successful sync was silently miscounted as an error.
 */
export async function syncAllPaidOrders(limit = 200): Promise<SyncAllPaidResult> {
    const sb = getSupabaseServer();

    const { data: orders, error } = await sb
        .from("orders")
        .select("clover_order_id")
        .eq("payment_status", "PAID")
        .order("created_time", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`Fetch orders: ${error.message}`);

    let synced = 0;
    let recordsCreated = 0;
    let errors = 0;
    const failedOrders: Array<{ orderId: string; error: string }> = [];

    for (const o of orders ?? []) {
        try {
            const res = await syncOrderToGhl(o.clover_order_id);
            if (res.outcome === "synced" || res.outcome === "partial") {
                synced++;
                recordsCreated += res.purchaseRecordIds.length;
            } else if (res.outcome === "error") {
                errors++;
                failedOrders.push({ orderId: o.clover_order_id, error: res.error ?? "unknown" });
            }
            // "skipped" (locked) and "held_for_review" (ineligible/unmatched) are
            // expected, non-error outcomes — do not count them as failures.
        } catch (e: any) {
            errors++;
            failedOrders.push({ orderId: o.clover_order_id, error: e?.message ?? String(e) });
        }
    }

    return {
        totalOrders: (orders ?? []).length,
        syncedOrders: synced,
        recordsCreated,
        errors,
        failedOrders: failedOrders.slice(0, 10),
    };
}
