import { createFileRoute } from "@tanstack/react-router";
import { AudienceBuilderPage } from "@/components/audience-builder-page";

export const Route = createFileRoute("/_authenticated/admin/audience-builder")({
  head: () => ({
    meta: [
      { title: "Audience Builder — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Combine the 34 CRM master-plan audiences with AND/OR logic and export deduplicated customer lists.",
      },
      { property: "og:title", content: "Audience Builder — Madd Hatter POS Sync" },
      { property: "og:description", content: "Build and export customer segments from Clover purchase history." },
    ],
  }),
  component: AudienceBuilderPage,
});
