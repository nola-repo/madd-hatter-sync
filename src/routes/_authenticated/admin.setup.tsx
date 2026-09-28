//
import { createFileRoute } from "@tanstack/react-router";
import { SetupGuide } from "@/components/setup-guide";

export const Route = createFileRoute("/_authenticated/admin/setup")({
    head: () => ({
        meta: [
            { title: "Setup Guide — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Step-by-step setup instructions for Clover, CRM, and Supabase.",
            },
            { property: "og:title", content: "Setup Guide — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Step-by-step setup instructions for Clover, CRM, and Supabase.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: SetupPage,
});

function SetupPage() {
    return <SetupGuide />;
}
