//
import { createFileRoute } from "@tanstack/react-router";
import { AudienceBuilderPage } from "@/components/audience-builder-page";

export const Route = createFileRoute("/_authenticated/admin/audience-builder")({
  head: () => ({
    meta: [
      { title: "Audience Builder — Madd Hatter POS Sync" },
      {
        name: "description",
        content:
          "Combine purchase, visit, spending, event & birthday criteria into deduplicated outreach lists.",
      },
    ],
  }),
  component: AudienceBuilderPage,
});
