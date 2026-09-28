//
import { createFileRoute } from "@tanstack/react-router";
import { CategoriesPage } from "@/components/categories-page";

export const Route = createFileRoute("/_authenticated/admin/categories")({
    head: () => ({
        meta: [
            { title: "Categories — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Clover inventory categories with sales performance.",
            },
            { property: "og:title", content: "Categories — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Clover inventory categories with sales performance.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: CategoriesPage,
});
