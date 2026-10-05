import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserManagementPage } from "@/components/user-management-page";
import { adminMe } from "@/lib/integration/auth.functions";
import { isSuperAdminEmail } from "@/lib/integration/super-admin";

export const Route = createFileRoute("/_authenticated/admin/user-management")({
  // Gate the route server-side: only the super admin may load it.
  beforeLoad: async () => {
    let email: string | null = null;
    try {
      const res = await adminMe();
      if (!res.setupRequired) email = res.session?.email ?? null;
    } catch {
      email = null;
    }
    if (!isSuperAdminEmail(email)) {
      throw redirect({ to: "/admin" });
    }
  },
  head: () => ({
    meta: [
      { title: "User Management — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Manage admin access and approvals.",
      },
      { property: "og:title", content: "User Management — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Manage admin access and approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <UserManagementPage />,
});
