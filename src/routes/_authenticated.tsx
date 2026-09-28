import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { adminMe } from "@/lib/integration/auth.functions";
import { AdminShell } from "@/components/admin-shell";
import { SyncProvider } from "@/hooks/use-sync-context";
import { useSilentAutoSync } from "@/hooks/use-silent-auto-sync";
import { useEffect, useState } from "react";

async function logoutRequest() {
    await fetch("/api/auth/logout", { method: "POST" });
}

/**
 * Read the session via the raw /api/auth/me route.
 *
 * This route handler receives the actual HTTP Request object with the Cookie
 * header intact, so it can validate the Supabase session reliably. On the
 * CLIENT this fetch sends the browser cookie with credentials:"include".
 *
 * On the SERVER (SSR) this internal fetch does NOT forward the browser's
 * Cookie header, so it returns null — which is why beforeLoad must NOT
 * redirect during SSR (see below).
 */
async function readSessionFromMeRoute(): Promise<{ userId: string; email: string } | null> {
    try {
        const res = await fetch("/api/auth/me", {
            headers: { accept: "application/json" },
            credentials: "include",
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.setupRequired) return null;
        return data?.session ?? null;
    } catch {
        return null;
    }
}

const isServer = typeof window === "undefined";

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async ({ location }) => {
        let session: { userId: string; email: string } | null = null;
        let setupRequired = false;

        // Try the adminMe server function first (reads cookie via request context
        // when those APIs are available).
        try {
            const res = await adminMe();
            if (res.setupRequired) {
                setupRequired = true;
            } else {
                session = res.session;
            }
        } catch {
            session = null;
        }

        // Fallback: raw /api/auth/me route. Works on the client (sends cookie).
        if (!setupRequired && !session) {
            session = await readSessionFromMeRoute();
        }

        if (setupRequired) {
            return { session: null, setupRequired: true };
        }

        // CRITICAL: during SSR the browser's Cookie header is NOT forwarded to
        // internal fetches / server-function request context in this runtime, so
        // session is null even when the user is authenticated. Redirecting here
        // would bounce authenticated users back to /login on every full page
        // load. Instead, during SSR we render a loading shell and let the
        // component re-check auth on the client (where the cookie IS sent).
        if (isServer) {
            return { session: null, setupRequired: false, ssrPending: true };
        }

        // Client-side: we can trust the session result here.
        if (!session && location.pathname !== "/login") {
            throw redirect({ to: "/login" });
        }
        if (session && location.pathname === "/login") {
            throw redirect({ to: "/admin" });
        }
        return { session, setupRequired: false, ssrPending: false };
    },
    component: AuthLayout,
});

function AuthLayout() {
    const ctx = Route.useRouteContext();
    const router = useRouter();
    const [clientSession, setClientSession] = useState<{
        userId: string;
        email: string;
    } | null>(ctx.session ?? null);
    const [checking, setChecking] = useState<boolean>(ctx.ssrPending ?? false);

    useEffect(() => {
        if (ctx.setupRequired) {
            router.navigate({ to: "/login" });
            return;
        }
        // If beforeLoad ran on the client and already resolved a session, use it.
        if (!ctx.ssrPending) {
            setClientSession(ctx.session ?? null);
            setChecking(false);
            return;
        }
        // SSR path: re-check auth on the client where the cookie is sent.
        let cancelled = false;
        setChecking(true);
        readSessionFromMeRoute().then((session) => {
            if (cancelled) return;
            setChecking(false);
            if (session) {
                setClientSession(session);
            } else {
                router.navigate({ to: "/login" });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [ctx.setupRequired, ctx.ssrPending, ctx.session, router]);

    if (ctx.setupRequired) return null;

    if (checking || (ctx.ssrPending && !clientSession)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted/40">
                <div className="text-sm text-muted-foreground">Loading dashboard…</div>
            </div>
        );
    }

    return (
        <SyncProvider>
            <AutoSyncBridge />
            <AdminShell
                email={clientSession?.email ?? null}
                onLogout={async () => {
                    await logoutRequest();
                    await router.invalidate();
                    router.navigate({ to: "/login" });
                }}
            >
                <Outlet />
            </AdminShell>
        </SyncProvider>
    );
}

/**
 * Mounts the silent background auto-sync hook INSIDE the SyncProvider so it
 * runs once globally across all authenticated pages. The hook pulls the
 * latest Clover data + processes customer mappings/tags on mount and every
 * 10 minutes, then bumps the global sync version so every page refreshes.
 */
function AutoSyncBridge() {
    useSilentAutoSync();
    return null;
}
