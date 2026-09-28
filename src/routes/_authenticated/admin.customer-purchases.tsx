//
import { createFileRoute } from "@tanstack/react-router";
import { CustomerPurchasesPage } from "@/components/customer-purchases-page";

export const Route = createFileRoute("/_authenticated/admin/customer-purchases")({
    head: () => ({
        meta: [
            { title: "Customer Purchases — Madd Hatter POS Sync" },
            {
                name: "description",
                content:
                    "Search who bought Wings, Burgers, or any item with exact customer mapping and CRM verification.",
            },
        ],
    }),
    component: CustomerPurchasesPage,
});
