//
import { createFileRoute } from "@tanstack/react-router";
import { PosDataPage } from "@/components/pos-data-page";

export const Route = createFileRoute("/_authenticated/admin/pos-data")({
    head: () => ({
        meta: [
            { title: "POS Data — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Inspect imported Clover orders and order items.",
            },
            { property: "og:title", content: "POS Data — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Inspect imported Clover orders and order items.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: () => <PosDataPage />,
});
