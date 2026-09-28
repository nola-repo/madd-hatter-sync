//
import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/products-page";

export const Route = createFileRoute("/_authenticated/admin/products")({
    head: () => ({
        meta: [
            { title: "Products — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Product and category sales analysis from synced order items.",
            },
            { property: "og:title", content: "Products — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Product and category sales analysis from synced order items.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <ProductsPage />,
});
