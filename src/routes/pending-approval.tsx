import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({
    meta: [
      { title: "Pending Approval — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Your account is awaiting administrator approval.",
      },
      { property: "og:title", content: "Pending Approval — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Your account is awaiting administrator approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
          <span className="text-xl">⏳</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Your account is pending approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in, but an administrator still needs to approve your account before you can
          access the dashboard. Please check back shortly.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
