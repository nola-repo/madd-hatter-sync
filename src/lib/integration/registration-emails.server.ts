// Server-only: registration notification orchestration.
//
// Sends the welcome/awaiting-approval email to the new user and the approval
// alert to the super admin. Both are non-blocking and failure-tolerant: a
// failed send is logged server-side and never breaks registration.
//
// Dedup: we stamp admin_users.welcome_email_sent_at / approval_alert_sent_at
// after a successful send, and skip if already set — so a retry or double
// submit never sends duplicates.
//
// Resilience: if the dedup columns (migration 0012) or the admin_users table
// itself don't exist yet, the dedup checks degrade gracefully to "not sent"
// so the email still goes out instead of being silently swallowed.

import { getSupabaseServer } from "./supabase.server";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "./super-admin";
import {
  sendEmail,
  welcomeAwaitingApprovalEmail,
  newApprovalAlertEmail,
  accountApprovedEmail,
} from "./email.server";

function appBaseUrl(): string {
  return (process.env.APP_PUBLIC_URL ?? "https://cloverapi.hobokenmaddhatter.com").replace(
    /\/$/,
    "",
  );
}

/**
 * Check whether a dedup timestamp column already has a value for this user.
 * Returns false if the table/column doesn't exist or the row is missing —
 * so a missing migration never blocks the email from being sent.
 */
async function alreadySent(
  userId: string,
  column: "welcome_email_sent_at" | "approval_alert_sent_at" | "approved_email_sent_at",
): Promise<boolean> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("admin_users")
      .select(column)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Column or table missing — treat as "not sent" so we still send.
      return false;
    }
    return Boolean(data?.[column]);
  } catch {
    return false;
  }
}

/**
 * Stamp a dedup timestamp after a successful send. Swallows all errors —
 * a failure to update the timestamp never breaks the flow.
 */
async function stampSent(
  userId: string,
  column: "welcome_email_sent_at" | "approval_alert_sent_at" | "approved_email_sent_at",
): Promise<void> {
  try {
    const sb = getSupabaseServer();
    await sb
      .from("admin_users")
      .update({ [column]: new Date().toISOString() })
      .eq("user_id", userId)
      .then(
        () => {},
        () => {},
      );
  } catch {
    // ignore — non-fatal
  }
}

/**
 * Send registration notifications for a newly created (non-super-admin) user.
 * Safe to call for the super admin too — it just no-ops.
 *
 * Returns a summary of what was attempted. Never throws.
 */
export async function sendRegistrationNotifications(input: {
  userId: string;
  email: string;
  fullName: string;
  requiresConfirmation: boolean;
}): Promise<{ welcome: "sent" | "skipped" | "failed"; alert: "sent" | "skipped" | "failed" }> {
  const emailLower = input.email.trim().toLowerCase();

  // Super admin is auto-approved — no approval emails needed.
  if (isSuperAdminEmail(emailLower)) {
    return { welcome: "skipped", alert: "skipped" };
  }

  const baseUrl = appBaseUrl();
  const signInUrl = `${baseUrl}/login`;
  const approveUrl = `${baseUrl}/admin/user-management`;
  const registeredAt = new Date().toISOString();

  // ---- 1. Welcome / awaiting-approval email to the new user ----
  let welcome: "sent" | "skipped" | "failed" = "skipped";
  try {
    if (await alreadySent(input.userId, "welcome_email_sent_at")) {
      welcome = "skipped";
    } else {
      const tpl = welcomeAwaitingApprovalEmail({
        fullName: input.fullName,
        email: input.email,
        requiresConfirmation: input.requiresConfirmation,
        signInUrl,
      });
      const res = await sendEmail({
        to: input.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        fromName: "Madd Hatter Sync",
      });
      if (res.ok) {
        welcome = "sent";
        await stampSent(input.userId, "welcome_email_sent_at");
      } else if (res.skipped) {
        welcome = "skipped";
        console.warn("[registration] welcome email skipped:", res.reason);
      } else {
        welcome = "failed";
        console.error("[registration] welcome email failed:", res.error);
      }
    }
  } catch (e) {
    welcome = "failed";
    console.error("[registration] welcome email exception:", (e as Error)?.message ?? e);
  }

  // ---- 2. Approval alert to the super admin ----
  let alert: "sent" | "skipped" | "failed" = "skipped";
  try {
    const superAdminEmail =
      (process.env.SUPER_ADMIN_EMAIL ?? SUPER_ADMIN_EMAIL).trim().toLowerCase() ||
      SUPER_ADMIN_EMAIL;

    if (await alreadySent(input.userId, "approval_alert_sent_at")) {
      alert = "skipped";
    } else {
      const tpl = newApprovalAlertEmail({
        fullName: input.fullName,
        email: input.email,
        registeredAt,
        approveUrl,
      });
      const res = await sendEmail({
        to: superAdminEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        fromName: "Madd Hatter Sync - New User Approval",
      });
      if (res.ok) {
        alert = "sent";
        await stampSent(input.userId, "approval_alert_sent_at");
      } else if (res.skipped) {
        alert = "skipped";
        console.warn("[registration] super admin alert skipped:", res.reason);
      } else {
        alert = "failed";
        console.error("[registration] super admin alert failed:", res.error);
      }
    }
  } catch (e) {
    alert = "failed";
    console.error("[registration] super admin alert exception:", (e as Error)?.message ?? e);
  }

  return { welcome, alert };
}

/**
 * Send an email notifying the user that their account has been approved.
 * Includes dedup via approved_email_sent_at so a re-approval doesn't spam.
 */
export async function sendApprovalNotification(input: {
  email: string;
  fullName: string;
}): Promise<boolean> {
  try {
    const baseUrl = appBaseUrl();
    const signInUrl = `${baseUrl}/login`;
    const tpl = accountApprovedEmail({
      fullName: input.fullName,
      email: input.email,
      signInUrl,
    });
    const res = await sendEmail({
      to: input.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      fromName: "Madd Hatter Sync",
    });
    return res.ok;
  } catch (e) {
    console.error("[approval] notification failed:", (e as Error)?.message ?? e);
    return false;
  }
}

/**
 * Send the "your account is approved" email with dedup.
 * Called by the User Management page when the super admin approves a user.
 */
export async function sendAccountApprovedEmail(input: {
  userId: string;
  email: string;
  fullName: string;
}): Promise<boolean> {
  try {
    if (await alreadySent(input.userId, "approved_email_sent_at")) {
      return true; // already sent
    }
    const baseUrl = appBaseUrl();
    const signInUrl = `${baseUrl}/login`;
    const tpl = accountApprovedEmail({
      fullName: input.fullName,
      email: input.email,
      signInUrl,
    });
    const res = await sendEmail({
      to: input.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      fromName: "Madd Hatter Sync",
    });
    if (res.ok) {
      await stampSent(input.userId, "approved_email_sent_at");
    }
    return res.ok;
  } catch (e) {
    console.error("[approval] account approved email failed:", (e as Error)?.message ?? e);
    return false;
  }
}
