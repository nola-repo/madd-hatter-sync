//
import { createFileRoute } from "@tanstack/react-router";
import { ModifiersPage } from "@/components/modifiers-page";

export const Route = createFileRoute("/_authenticated/admin/modifiers")({
    head: () => ({
        meta: [
            { title: "Modifier Groups — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Clover modifier groups and modifiers.",
            },
            { property: "og:title", content: "Modifier Groups — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Clover modifier groups and modifiers.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: ModifiersPage,
});
