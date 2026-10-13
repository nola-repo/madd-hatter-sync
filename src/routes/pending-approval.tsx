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
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundColor: "var(--clay-bg)",
        fontFamily: "var(--clay-font)",
      }}
    >
      <div className="clay-surface w-full max-w-md p-8 text-center sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--clay-primary)]/10">
          <span className="text-3xl">🎩</span>
        </div>
        <h1
          className="text-2xl font-extrabold tracking-tight"
          style={{ color: "var(--clay-text)" }}
        >
          Thanks for signing up!
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--clay-muted)" }}>
          Your account has been created and is waiting for approval from the Madd Hatter Sync
          administrator. We've notified them by email — you'll be able to sign in as soon as your
          account is approved. This usually doesn't take long.
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--clay-muted)" }}>
          Didn't get a confirmation? Check your spam folder.
        </p>
        <Link
          to="/login"
          className="clay-button mt-7 flex h-12 w-full items-center justify-center gap-2 text-base font-bold"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
