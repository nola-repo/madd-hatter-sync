//
import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/analytics-page";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
    head: () => ({
        meta: [
            { title: "Analytics — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Business performance insights from POS data.",
            },
            { property: "og:title", content: "Analytics — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Business performance insights from POS data.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <AnalyticsPage />,
});
