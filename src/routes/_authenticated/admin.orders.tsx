//
import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/components/orders-page";

export const Route = createFileRoute("/_authenticated/admin/orders")({
    head: () => ({
        meta: [
            { title: "Orders — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Browse synced Clover orders and sync new orders to CRM.",
            },
            { property: "og:title", content: "Orders — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Browse synced Clover orders and sync new orders to CRM.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <OrdersPage />,
});
