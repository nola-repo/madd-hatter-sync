//
import { createFileRoute } from "@tanstack/react-router";
import { EmployeesPage } from "@/components/employees-page";

export const Route = createFileRoute("/_authenticated/admin/employees")({
    head: () => ({
        meta: [
            { title: "Employees — Madd Hatter POS Sync" },
            {
                name: "description",
                content: "Clover employees with sales performance.",
            },
            { property: "og:title", content: "Employees — Madd Hatter POS Sync" },
            {
                property: "og:description",
                content: "Clover employees with sales performance.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: EmployeesPage,
});
