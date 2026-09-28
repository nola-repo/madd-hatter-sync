import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: "Madd Hatter POS Sync — Clover to CRM Middleware" },
            {
                name: "description",
                content:
                    "Sandbox middleware that syncs Clover purchases into CRM contacts and custom purchase records. Admin dashboard.",
            },
            { property: "og:title", content: "Madd Hatter POS Sync — Clover to CRM Middleware" },
            {
                property: "og:description",
                content:
                    "Sandbox middleware that syncs Clover purchases into CRM contacts and custom purchase records.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    beforeLoad: () => {
        // The dashboard is the whole app; send visitors straight to admin (which
        // redirects to /login if unauthenticated).
        throw redirect({ to: "/admin" });
    },
    component: () => null,
});
