import { env } from "../../config/env";
import { logger } from "../logger";

/** Sends through Resend's HTTP API. Without RESEND_API_KEY (local dev), emails are only logged. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  if (!env.resendApiKey) {
    logger.info({ to: msg.to, subject: msg.subject }, "email (not sent: RESEND_API_KEY not set)");
    return { ok: true, skipped: true as const };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { ok: true, skipped: false as const };
}
