//
import { createFileRoute } from "@tanstack/react-router";
import { PurchaseMappingPage } from "@/components/purchase-mapping-page";

export const Route = createFileRoute("/_authenticated/admin/purchase-mapping")({
    head: () => ({
        meta: [
            { title: "Purchase Mapping — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Find customers who purchased an item and tag their CRM contact.",
            },
        ],
    }),
    component: PurchaseMappingPage,
});
