import { createFileRoute } from "@tanstack/react-router";
import { sendEmail } from "../../lib/integration/email.server";
import { SUPER_ADMIN_EMAIL } from "../../lib/integration/super-admin";

// Diagnostic endpoint: tests the Resend email pipeline end-to-end and returns
// the result to the browser so we can see why registration emails aren't
// arriving. Protected by SYNC_SECRET (same as the sync cron endpoints).
// Does NOT expose any secret values — only booleans, domain hints, and the
// Resend API error message (which contains no secrets).

export const Route = createFileRoute("/api/test-email")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const syncSecret = (process.env.SYNC_SECRET ?? "").trim();
          const provided = url.searchParams.get("secret") ?? "";
          if (!syncSecret || provided !== syncSecret) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
          const fromAddress = (process.env.EMAIL_FROM_ADDRESS ?? "").trim();
          const superAdminEmail =
            (process.env.SUPER_ADMIN_EMAIL ?? SUPER_ADMIN_EMAIL).trim().toLowerCase() ||
            SUPER_ADMIN_EMAIL;

          // Show the domain part of the from address (not the full secret)
          // so we can confirm it's on the verified domain.
          const fromDomain = fromAddress.includes("@")
            ? fromAddress.split("@")[1]
            : "(no @ in address)";

          if (!apiKey) {
            return Response.json({
              ok: false,
              step: "config",
              reason: "RESEND_API_KEY is not configured (empty)",
              resendKeyConfigured: false,
              fromAddressConfigured: Boolean(fromAddress),
              fromDomain,
              superAdminEmail,
            });
          }

          if (!fromAddress) {
            return Response.json({
              ok: false,
              step: "config",
              reason: "EMAIL_FROM_ADDRESS is not configured (empty)",
              resendKeyConfigured: true,
              fromAddressConfigured: false,
              fromDomain,
              superAdminEmail,
            });
          }

          // Attempt a real send to the super admin.
          const res = await sendEmail({
            to: superAdminEmail,
            subject: "Madd Hatter Sync — email diagnostic test",
            html: `<p>This is a diagnostic test from Madd Hatter Sync.</p><p>If you received this, the email pipeline is working.</p>`,
            text: "This is a diagnostic test from Madd Hatter Sync. If you received this, the email pipeline is working.",
            fromName: "Madd Hatter Sync",
          });

          return Response.json({
            ok: res.ok,
            skipped: "skipped" in res ? res.skipped : false,
            reason: "reason" in res ? res.reason : undefined,
            error: "error" in res ? res.error : undefined,
            messageId: "id" in res ? res.id : undefined,
            resendKeyConfigured: true,
            fromAddressConfigured: true,
            fromAddress,
            fromDomain,
            superAdminEmail,
          });
        } catch (e: any) {
          return Response.json(
            { ok: false, error: e?.message ?? String(e), stack: e?.stack },
            { status: 500 },
          );
        }
      },
    },
  },
});
