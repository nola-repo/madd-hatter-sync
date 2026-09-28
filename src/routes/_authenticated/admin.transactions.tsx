//
import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "@/components/transactions-page";

export const Route = createFileRoute("/_authenticated/admin/transactions")({
    head: () => ({
        meta: [
            { title: "Transactions — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Clover payment transactions and tender details.",
            },
            { property: "og:title", content: "Transactions — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Clover payment transactions and tender details.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: TransactionsPage,
});
