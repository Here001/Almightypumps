/** Sending email through Resend (https://resend.com). */
import { eq } from "drizzle-orm";
import { users } from "./db/schema";
import { getDb } from "./db";
import { rateLimit } from "./rateLimit";
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
export function codeEmail(code: string, purpose: "signup" | "login" | "reset", name: string) {
  const what = purpose === "signup" ? "finish creating your account" : purpose === "reset" ? "reset your password" : "log in on a new device";
  const subject = `${code} is your Almighty Pumps code`;
  const text = `Hi ${name},\n\nYour code to ${what} is: ${code}\n\nIt expires in 10 minutes. If you didn't try to ${what}, ignore this email${purpose === "login" ? " and change your password: someone knows it" : purpose === "reset" ? "; your password stays the same" : ""}.\n\nAlmighty Pumps · support@almightypumps.com`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<p style="font-weight:700;letter-spacing:.08em;margin:0 0 24px">ALMIGHTY PUMPS</p>
<p>Hi ${escape(name)},</p>
<p>Your code to ${what} is:</p>
<p style="font-size:34px;font-weight:700;letter-spacing:.2em;margin:16px 0;font-family:'Courier New',monospace">${code}</p>
<p style="color:#555">It expires in 10 minutes. If you didn't try to ${what}, ignore this email${purpose === "login" ? " and change your password: someone knows it" : purpose === "reset" ? "; your password stays the same" : ""}.</p>
<p style="color:#888;font-size:12px;margin-top:32px">Almighty Pumps · <a href="mailto:support@almightypumps.com" style="color:#888">support@almightypumps.com</a></p>
</div>`;
  return { subject, text, html };
}

let adminCache = { at: 0, set: new Set<string>() };
async function adminEmails(db: ReturnType<typeof getDb>) {
  if (Date.now() - adminCache.at > 5 * 60_000) {
    const rows = await db.select({ email: users.email }).from(users).where(eq(users.role, "admin")).catch(() => []);
    adminCache = { at: Date.now(), set: new Set(rows.map((r) => r.email.toLowerCase())) };
  }
  return adminCache.set;
}

/** A plain notification (admin alerts, payment updates). */
export async function sendNotice(to: string[], subject: string, lines: string[], link?: { href: string; label: string }) {
  if (!emailConfigured() || to.length === 0) { console.warn("[email] notice not sent (email off or no recipients):", subject); return; }
  const text = `${lines.join("\n\n")}${link ? `\n\n${link.label}: ${link.href}` : ""}\n\nAlmighty Pumps`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
<p style="font-weight:700;letter-spacing:.08em;margin:0 0 24px">ALMIGHTY PUMPS</p>
${lines.map((l) => `<p>${escape(l)}</p>`).join("\n")}
${link ? `<p><a href="${escape(link.href)}" style="display:inline-block;background:#ff6a2b;color:#111;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${escape(link.label)}</a></p>` : ""}
</div>`;
  const db = getDb();
  const admins = await adminEmails(db);
  for (const addr of [...new Set(to.map((a) => a.trim().toLowerCase()))]) {
    // Cost control: a daily budget for all notification emails, and a daily cap per customer address
    // (admins are exempt from the per-address cap so you never miss an alert). Login codes are not affected.
    if (!admins.has(addr) && !(await rateLimit(db, "emailTo", addr, { silent: true }))) { console.warn("[email] daily cap reached for a recipient, skipped:", subject); continue; }
    if (!(await rateLimit(db, "emailNotice", "all", { silent: true }))) { console.warn("[email] daily notification budget used up, skipped:", subject); break; }
    await sendEmail(addr, subject, text, html).catch((e) => console.error("[email] notice failed", addr, e));
  }
}
