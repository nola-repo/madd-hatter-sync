//
// Server-only: failure alerting via a webhook URL (Slack-compatible).
// Set ALERT_WEBHOOK_URL in your env to enable. Silently skips if not set.
// Called by the sync route whenever a sync run fails.
//
// Supports:
//   - Slack Incoming Webhook: https://hooks.slack.com/services/...
//   - Discord Webhook: add /slack to the Discord webhook URL
//   - Any generic HTTP endpoint that accepts { text: string }

export type AlertLevel = "error" | "warn" | "info";

export async function sendSyncAlert(opts: {
    level: AlertLevel;
    title: string;
    detail: string;
    context?: Record<string, string | number | null>;
}): Promise<void> {
    const webhookUrl = process.env['ALERT_WEBHOOK_URL']?.trim();
    if (!webhookUrl) return; // alerting is optional — skip silently

    const emoji = opts.level === "error" ? "🚨" : opts.level === "warn" ? "⚠️" : "ℹ️";

    const contextLines = opts.context
        ? Object.entries(opts.context)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => `• *${k}:* ${v}`)
              .join("\n")
        : "";

    const text = [
        `${emoji} *${opts.title}*`,
        opts.detail,
        contextLines,
        `_${new Date().toISOString()}_`,
    ]
        .filter(Boolean)
        .join("\n");

    try {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
    } catch {
        // Alerting must never crash the sync — swallow all errors.
    }
}

