//
import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /admin — renders nested child pages via <Outlet />.
// The Dashboard content lives in admin.index.tsx.
export const Route = createFileRoute("/_authenticated/admin")({
    head: () => ({
        meta: [
            { title: "Dashboard — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Business overview of POS sales, orders, customers, and products.",
            },
            { property: "og:title", content: "Dashboard — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Business overview of POS sales, orders, customers, and products.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <Outlet />,
});
