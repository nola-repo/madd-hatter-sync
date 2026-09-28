//
import { createFileRoute } from "@tanstack/react-router";
import { ProductMappingPage } from "@/components/product-mapping-page";

export const Route = createFileRoute("/_authenticated/admin/product-mapping")({
    head: () => ({
        meta: [
            { title: "Product Mapping — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "View canonical inventory mappings, purchase tags, and CRM custom object schemas.",
            },
        ],
    }),
    component: ProductMappingPage,
});
