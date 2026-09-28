//
import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings-page";

export const Route = createFileRoute("/_authenticated/admin/settings")({
    head: () => ({
        meta: [
            { title: "Settings — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Connection and integration configuration for Clover, CRM, and Supabase.",
            },
            { property: "og:title", content: "Settings — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Connection and integration configuration for Clover, CRM, and Supabase.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <SettingsPage />,
});
