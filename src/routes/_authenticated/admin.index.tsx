//
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard-page";

export const Route = createFileRoute("/_authenticated/admin/")({
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
    component: DashboardPage,
});
