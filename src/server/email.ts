/** Sending email through Resend (https://resend.com). */
import { env } from "./env";
import { AppError } from "./errors";

export const emailConfigured = () => Boolean(env().RESEND_API_KEY);

export async function sendEmail(to: string, subject: string, text: string, html: string) {
  const e = env();
  const res = await fetch(`${e.RESEND_BASE_URL.replace(/\/+$/, "")}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [to], subject, text, html, reply_to: "support@almightypumps.com" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => { console.error("[email] send failed", err); return null; });
  if (!res || !res.ok) {
    const body = res ? (await res.text()).slice(0, 300) : "no response";
    console.error(`[email] resend ${res?.status ?? "-"} ${body}`);
    throw new AppError(502, "EMAIL_FAILED", "We couldn't send the email just now. Please try again in a minute.");
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The 6-digit code email. */
export function codeEmail(code: string, purpose: "signup" | "login", name: string) {
  const what = purpose === "signup" ? "finish creating your account" : "log in on a new device";
  const subject = `${code} is your Almighty Pumps code`;
  const text = `Hi ${name},\n\nYour code to ${what} is: ${code}\n\nIt expires in 10 minutes. If you didn't try to ${what}, ignore this email${purpose === "login" ? " and change your password: someone knows it" : ""}.\n\nAlmighty Pumps · support@almightypumps.com`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<p style="font-weight:700;letter-spacing:.08em;margin:0 0 24px">ALMIGHTY PUMPS</p>
<p>Hi ${escape(name)},</p>
<p>Your code to ${what} is:</p>
<p style="font-size:34px;font-weight:700;letter-spacing:.2em;margin:16px 0;font-family:'Courier New',monospace">${code}</p>
<p style="color:#555">It expires in 10 minutes. If you didn't try to ${what}, ignore this email${purpose === "login" ? " and change your password: someone knows it" : ""}.</p>
<p style="color:#888;font-size:12px;margin-top:32px">Almighty Pumps · <a href="mailto:support@almightypumps.com" style="color:#888">support@almightypumps.com</a></p>
</div>`;
  return { subject, text, html };
}
