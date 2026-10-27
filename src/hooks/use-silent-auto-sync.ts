import { useEffect, useRef, useCallback } from "react";
import {
    refreshPos,
    processPendingPurchasesFn,
    syncAllPaidOrdersToCustomObjectsFn,
} from "@/lib/integration/integration.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSyncContext } from "./use-sync-context";

const INITIAL_DELAY_MS = 2_000;
const RECURRING_INTERVAL_MS = 2 * 60 * 1_000; // 2 minutes — automated pipeline
const VISIBILITY_DEBOUNCE_MS = 30_000;

// FIX #19: Cross-tab sync deduplication via localStorage.
// Without this, multiple open browser tabs each ran the full sync pipeline every
// 2 minutes independently, doubling (or more) GHL API load.
const SYNC_LOCK_KEY = "mh_sync_tab_lock";
const SYNC_LOCK_TTL_MS = 90_000; // 90 s — safely covers one full pipeline run

function tryAcquireCrossTabLock(): boolean {
    try {
        const stored = localStorage.getItem(SYNC_LOCK_KEY);
        if (stored) {
            const ts = parseInt(stored, 10);
            // Another tab claimed the lock and it hasn't expired yet → skip.
            if (!isNaN(ts) && Date.now() - ts < SYNC_LOCK_TTL_MS) return false;
        }
        // Claim the lock with the current timestamp.
        localStorage.setItem(SYNC_LOCK_KEY, Date.now().toString());
        return true;
    } catch {
        // localStorage unavailable (private browsing, SSR) → allow sync.
        return true;
    }
}

function releaseCrossTabLock(): void {
    try {
        localStorage.removeItem(SYNC_LOCK_KEY);
    } catch {
        // Ignore — failure here is harmless; the TTL will expire the lock.
    }
}

/**
 * Global background auto-sync pipeline:
 * 1. Automatically pulls latest Clover POS data (orders, items, payments, customers)
 * 2. Matches customers against CRM contacts & applies `Clover - Purchased: <Item>` tags
 * 3. Automatically syncs paid order line items to POS Purchase Item custom objects
 * 4. Calls `bump()` to refresh dashboard/orders/analytics views across the app
 *
 * Uses a localStorage cross-tab lock so only ONE browser tab runs the pipeline
 * at a time, preventing duplicate GHL API calls when multiple tabs are open.
 */
export function useSilentAutoSync() {
    const refreshFn = useServerFn(refreshPos);
    const processMappingsFn = useServerFn(processPendingPurchasesFn);
    const syncCustomObjectsFn = useServerFn(syncAllPaidOrdersToCustomObjectsFn);
    const { bump, setSyncing } = useSyncContext();
    const syncInFlight = useRef(false);
    const lastSyncAt = useRef(0);

    const runSync = useCallback(
        async (silent = true) => {
            // Per-tab in-flight guard (fast path).
            if (syncInFlight.current) return;

            // FIX #19: Cross-tab lock — only one tab runs the pipeline at a time.
            if (!tryAcquireCrossTabLock()) return;

            syncInFlight.current = true;
            if (!silent) setSyncing(true);
            try {
                // Step 1: Pull latest Clover data for current month
                await refreshFn({ data: { kind: "incremental", range: "month" } });

                // Step 2: Auto-match customers and apply purchase tags
                try {
                    await processMappingsFn({ data: { limit: 100 } });
                } catch (mErr) {
                    console.warn("[silent-auto-sync] Mapping step notice:", mErr);
                }

                // Step 3: Auto-sync paid orders to POS Purchase Items custom objects
                try {
                    await syncCustomObjectsFn({ data: { limit: 100 } });
                } catch (coErr) {
                    console.warn("[silent-auto-sync] Custom object step notice:", coErr);
                }

                lastSyncAt.current = Date.now();
                bump();
            } catch (err) {
                console.warn("[silent-auto-sync] run failed:", err);
            } finally {
                syncInFlight.current = false;
                releaseCrossTabLock();
                if (!silent) setSyncing(false);
            }
        },
        [refreshFn, processMappingsFn, syncCustomObjectsFn, bump, setSyncing],
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            runSync(true);
        }, INITIAL_DELAY_MS);

        const interval = setInterval(() => {
            runSync(true);
        }, RECURRING_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (
                document.visibilityState === "visible" &&
                Date.now() - lastSyncAt.current > VISIBILITY_DEBOUNCE_MS
            ) {
                runSync(true);
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            // Release lock on unmount so other tabs can pick up immediately.
            releaseCrossTabLock();
        };
    }, [runSync]);
}
