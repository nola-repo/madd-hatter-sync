//
import { createFileRoute } from "@tanstack/react-router";
import { SyncLogsPage } from "@/components/sync-logs-page";

export const Route = createFileRoute("/_authenticated/admin/logs")({
    head: () => ({
        meta: [
            { title: "Sync Execution Logs — Madd Hatter POS Sync" },
            {
                name: "description",
                content:
                    "View correlation execution logs for Clover sync, customer matching, and CRM updates.",
            },
        ],
    }),
    component: SyncLogsPage,
});
