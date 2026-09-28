//
import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/components/customers-page";

export const Route = createFileRoute("/_authenticated/admin/customers")({
    head: () => ({
        meta: [
            { title: "Customers — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Customer-level purchasing information from synced orders.",
            },
            { property: "og:title", content: "Customers — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Customer-level purchasing information from synced orders.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <CustomersPage />,
});
