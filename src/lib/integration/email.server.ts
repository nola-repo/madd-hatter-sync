// Server-only transactional email service via Resend.
//
// Reads RESEND_API_KEY and EMAIL_FROM_ADDRESS from process.env at call time.
// If unconfigured, resolves to { ok: false, skipped: true } without throwing.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = (process.env["RESEND_API_KEY"] ?? "").trim();
  const fromAddress = (process.env["EMAIL_FROM_ADDRESS"] ?? "onboarding@resend.dev").trim();

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", input.to);
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  const from = input.fromName ? `${input.fromName} <${fromAddress}>` : fromAddress;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend API error", res.status, body);
      return { ok: false, skipped: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? "unknown" };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[email] send failed:", msg);
    return { ok: false, skipped: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailShell(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
  callToAction?: { label: string; url: string };
  footerNote?: string;
}): string {
  const ctaHtml = opts.callToAction
    ? `
      <div style="margin: 28px 0 20px 0; text-align: center;">
        <a href="${opts.callToAction.url}"
           style="background-color: #0b5d3b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: bold; font-size: 15px; display: inline-block;">
          ${escapeHtml(opts.callToAction.label)}
        </a>
      </div>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(opts.title)}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8f4ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #2a2118;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(opts.preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8f4ec; padding: 40px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #fbf8f1; border-radius: 24px; box-shadow: 0 4px 16px rgba(42, 33, 24, 0.06); padding: 36px 32px; border: 1px solid rgba(42, 33, 24, 0.08);">
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 700; color: #0b5d3b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Madd Hatter Sync</div>
                    <h1 style="font-size: 22px; font-weight: 800; color: #2a2118; margin: 0 0 16px 0; line-height: 1.3;">${escapeHtml(opts.title)}</h1>
                    <div style="font-size: 15px; line-height: 1.6; color: #4a3e31;">
                      ${opts.bodyHtml}
                    </div>
                    ${ctaHtml}
                    ${opts.footerNote ? `<p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(42, 33, 24, 0.1); font-size: 12px; color: #8a7f70;">${escapeHtml(opts.footerNote)}</p>` : ""}
                  </td>
                </tr>
              </table>
              <div style="margin-top: 20px; font-size: 12px; color: #8a7f70;">
                Madd Hatter POS & CRM Sync &bull; Hoboken, NJ
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function welcomeAwaitingApprovalEmail(opts: {
  fullName: string;
  email: string;
  requiresConfirmation: boolean;
  signInUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = opts.fullName ? escapeHtml(opts.fullName) : "there";
  const title = "Welcome to Madd Hatter Sync";
  const subject = "Welcome to Madd Hatter Sync — your account is awaiting approval";

  const confirmParagraph = opts.requiresConfirmation
    ? `<p style="background: rgba(11, 93, 59, 0.08); border-left: 3px solid #0b5d3b; padding: 10px 14px; border-radius: 6px; margin: 16px 0;"><strong>Next step:</strong> Please confirm your email address via the verification link sent by Supabase.</p>`
    : "";

  const bodyHtml = `
    <p>Hi ${safeName},</p>
    <p>Your administrator account has been created for Madd Hatter POS Sync.</p>
    ${confirmParagraph}
    <p>To protect customer purchase and POS data, new accounts require approval by the super administrator before dashboard access is granted. We have notified the administrator of your request.</p>
    <p>You will be able to sign in once your account is approved. This usually doesn't take long.</p>
  `;

  const text = `Hi ${opts.fullName || "there"},\n\nYour administrator account has been created for Madd Hatter POS Sync.\n\n${opts.requiresConfirmation ? "Next step: Please confirm your email address via the link sent to your inbox.\n\n" : ""}To protect customer purchase and POS data, new accounts require approval by the super administrator before dashboard access is granted. We have notified the administrator of your request.\n\nYou will be able to sign in once your account is approved.\n\nSign in: ${opts.signInUrl}`;

  return {
    subject,
    html: emailShell({
      preheader: "Your account has been created and is awaiting administrator approval.",
      title,
      bodyHtml,
      callToAction: { label: "Go to Sign In", url: opts.signInUrl },
      footerNote: "Didn't request this account? You can ignore this email.",
    }),
    text,
  };
}

export function newApprovalAlertEmail(opts: {
  fullName: string;
  email: string;
  registeredAt: string;
  approveUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = opts.fullName ? escapeHtml(opts.fullName) : "Unknown";
  const safeEmail = escapeHtml(opts.email);
  const title = "New user awaiting approval";
  const subject = `New user awaiting approval: ${opts.fullName || opts.email}`;

  const bodyHtml = `
    <p>A new administrator account has registered and is awaiting your approval:</p>
    <table role="presentation" style="width: 100%; margin: 16px 0; border-collapse: collapse; background: rgba(42, 33, 24, 0.04); border-radius: 8px; padding: 12px;">
      <tr><td style="padding: 8px 12px; font-weight: 600; color: #2a2118; width: 35%;">Name:</td><td style="padding: 8px 12px; color: #4a3e31;">${safeName}</td></tr>
      <tr><td style="padding: 8px 12px; font-weight: 600; color: #2a2118;">Email:</td><td style="padding: 8px 12px; color: #4a3e31;">${safeEmail}</td></tr>
      <tr><td style="padding: 8px 12px; font-weight: 600; color: #2a2118;">Registered:</td><td style="padding: 8px 12px; color: #4a3e31;">${escapeHtml(new Date(opts.registeredAt).toLocaleString())}</td></tr>
    </table>
    <p>Click below to open User Management and approve or reject this user.</p>
  `;

  const text = `New user awaiting approval:\n\nName: ${opts.fullName || "Unknown"}\nEmail: ${opts.email}\nRegistered: ${opts.registeredAt}\n\nReview & Approve: ${opts.approveUrl}`;

  return {
    subject,
    html: emailShell({
      preheader: `New user awaiting approval: ${opts.fullName || opts.email}`,
      title,
      bodyHtml,
      callToAction: { label: "Review in User Management", url: opts.approveUrl },
      footerNote: "Only super administrators receive this alert.",
    }),
    text,
  };
}

export function accountApprovedEmail(opts: {
  fullName: string;
  email: string;
  signInUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = opts.fullName ? escapeHtml(opts.fullName) : "there";
  const title = "Your account has been approved";
  const subject = "Your Madd Hatter Sync account is approved";

  const bodyHtml = `
    <p>Hi ${safeName},</p>
    <p>Good news! Your administrator account has been approved by the super administrator.</p>
    <p>You now have full access to the Madd Hatter POS Sync dashboard.</p>
  `;

  const text = `Hi ${opts.fullName || "there"},\n\nGood news! Your administrator account has been approved.\n\nYou now have full access to the Madd Hatter POS Sync dashboard.\n\nSign in: ${opts.signInUrl}`;

  return {
    subject,
    html: emailShell({
      preheader: "Your account has been approved. You can now sign in.",
      title,
      bodyHtml,
      callToAction: { label: "Sign In to Dashboard", url: opts.signInUrl },
    }),
    text,
  };
}
