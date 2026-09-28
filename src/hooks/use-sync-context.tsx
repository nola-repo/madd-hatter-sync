import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type SyncState = {
    version: number;
    isSyncing: boolean;
    lastSyncedAt: number | null;
    lastError: string | null;
};

type SyncContextValue = SyncState & {
    /** Increment version — invalidates every page's cached data so they re-fetch. */
    bump: () => void;
    /** Mark the global sync as in-progress (or not). */
    setSyncing: (syncing: boolean) => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SyncState>({
        version: 0,
        isSyncing: false,
        lastSyncedAt: null,
        lastError: null,
    });

    const bump = useCallback(() => {
        setState((s) => ({
            ...s,
            version: s.version + 1,
            lastSyncedAt: Date.now(),
        }));
    }, []);

    const setSyncing = useCallback((syncing: boolean) => {
        setState((s) => ({ ...s, isSyncing: syncing }));
    }, []);

    return (
        <SyncContext.Provider value={{ ...state, bump, setSyncing }}>{children}</SyncContext.Provider>
    );
}

export function useSyncContext(): SyncContextValue {
    const ctx = useContext(SyncContext);
    if (!ctx) {
        throw new Error("useSyncContext must be used within a SyncProvider");
    }
    return ctx;
}

/** Re-run effects when the global sync version changes. */
export function useSyncVersion(): number {
    const ctx = useContext(SyncContext);
    return ctx?.version ?? 0;
}

export function useIsSyncing(): boolean {
    const ctx = useContext(SyncContext);
    return ctx?.isSyncing ?? false;
}
