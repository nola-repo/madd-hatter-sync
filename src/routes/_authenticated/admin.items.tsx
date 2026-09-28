//
import { createFileRoute } from "@tanstack/react-router";
import { ItemsPage } from "@/components/items-page";

export const Route = createFileRoute("/_authenticated/admin/items")({
    head: () => ({
        meta: [
            { title: "Item List — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Clover inventory items with sales performance.",
            },
            { property: "og:title", content: "Item List — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Clover inventory items with sales performance.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: ItemsPage,
});
