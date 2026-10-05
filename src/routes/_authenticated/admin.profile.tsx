import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/profile-page";

export const Route = createFileRoute("/_authenticated/admin/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Your account profile.",
      },
      { property: "og:title", content: "Profile — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Your account profile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});
