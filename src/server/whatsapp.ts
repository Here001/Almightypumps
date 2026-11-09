/**
 * WhatsApp agent, part 1: the WhatsApp side (Meta WhatsApp Cloud API).
 * - Webhook: GET = Meta's one-time check (verify token), POST = incoming messages (signed with the app secret).
 * - Linking: the customer gets a 6-character code in Settings and sends "LINK CODE" to our WhatsApp number.
 * - Sending replies (free inside the 24-hour customer service window, which is always the case for replies).
 * The AI part (Claude + tools + "YES" purchases) is in whatsappAgent.ts.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { users, whatsappAiUsage, whatsappChats, whatsappLinkCodes, whatsappLinks, whatsappMessages } from "./db/schema";
import { env } from "./env";
import { emailConfigured, sendEmail } from "./email";
import { AppError, badRequest } from "./errors";
import { rateLimit } from "./rateLimit";
import { asEmail, asSixDigits, makeLinkCode, maskPhone, parseLinkCommand, parseWebhook, splitForWhatsApp, waDigits, type WaIncoming } from "@/core/whatsapp";

export type WhatsAppConfig = {
  enabled: boolean;           // AI replies on/off (linking and "we're off" replies still work)
  businessNumber: string;     // our WhatsApp number, digits only (for wa.me links in Settings)
  dailyBudgetUsd: number;     // AI spend cap per Lagos day; over it customers are pointed to the website
  graphVersion: string;       // Meta Graph API version
};
const DEFAULTS: WhatsAppConfig = { enabled: false, businessNumber: "", dailyBudgetUsd: 5, graphVersion: "v23.0" };
const KEY = "whatsapp_agent";

export const getWhatsAppConfig = (db: Db) => readSetting<WhatsAppConfig>(db, KEY, DEFAULTS);
export async function updateWhatsAppConfig(db: Db, input: Partial<WhatsAppConfig>) {
  const cur = await getWhatsAppConfig(db);
  const next = { ...cur, ...input };
  next.businessNumber = waDigits(next.businessNumber);
  if (next.businessNumber && !/^\d{8,15}$/.test(next.businessNumber)) throw badRequest("Enter the WhatsApp number with its country code, e.g. 2348012345678.");
  if (!/^v\d{2}\.0$/.test(next.graphVersion)) throw badRequest("Graph API version looks like v23.0.");
  if (!(next.dailyBudgetUsd >= 0 && next.dailyBudgetUsd <= 500)) throw badRequest("Daily AI budget must be between $0 and $500.");
  return writeSetting(db, KEY, next);
}

/** The token Meta asks for when you add the webhook. Derived from SESSION_SECRET, so it needs no extra setting. */
export const verifyToken = () => createHmac("sha256", env().SESSION_SECRET).update("whatsapp-webhook-verify").digest("base64url").slice(0, 32);

export function setupStatus() {
  const e = env();
  return {
    accessToken: !!e.WHATSAPP_ACCESS_TOKEN, phoneNumberId: !!e.WHATSAPP_PHONE_NUMBER_ID, appSecret: !!e.WHATSAPP_APP_SECRET, anthropicKey: !!e.ANTHROPIC_API_KEY,
    webhookUrl: `${e.APP_URL.replace(/\/+$/, "")}/api/webhooks/whatsapp`, verifyToken: verifyToken(),
  };
}

/** Meta signs each webhook POST: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function validSignature(raw: string, header: string | null): boolean {
  const secret = env().WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

/* ---------------- Sending ---------------- */

async function graphUrl(db: Db) {
  const e = env();
  const base = e.WHATSAPP_GRAPH_URL || `https://graph.facebook.com/${(await getWhatsAppConfig(db)).graphVersion}`;
  return `${base.replace(/\/+$/, "")}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

/** Send a text reply (split if long) and log it. Never throws: a failed send is logged. */
export async function sendWhatsApp(db: Db, to: string, text: string, userId: string | null = null) {
  const e = env();
  if (!e.WHATSAPP_ACCESS_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID) { console.error("[whatsapp] not configured, reply dropped"); return; }
  const url = await graphUrl(db);
  for (const part of splitForWhatsApp(text)) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: part } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) console.error("[whatsapp] send failed", r.status, (await r.text()).slice(0, 300));
      await db.insert(whatsappMessages).values({ phone: to, userId, direction: "out", body: part });
    } catch (err) { console.error("[whatsapp] send error", err); }
  }
}

/** Mark the customer's message as read (blue ticks) so they know we got it while the AI thinks. */
async function markRead(db: Db, waId: string) {
  const e = env();
  if (!e.WHATSAPP_ACCESS_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID) return;
  await fetch(await graphUrl(db), {
    method: "POST",
    headers: { authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: waId }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}

/* ---------------- Linking ---------------- */

const hashCode = (code: string) => createHash("sha256").update(`${env().SESSION_SECRET}:wa:${code.toUpperCase()}`).digest("hex");

/** Customer (Settings): linked number or none, plus our number for the wa.me link. */
export async function myWhatsApp(db: Db, userId: string) {
  const cfg = await getWhatsAppConfig(db);
  const [link] = await db.select().from(whatsappLinks).where(eq(whatsappLinks.userId, userId));
  return { linked: link ? { phone: maskPhone(link.phone), since: link.linkedAt } : null, businessNumber: cfg.businessNumber || null, available: !!cfg.businessNumber };
}

/** Customer: a fresh code, valid 15 minutes. */
export async function newLinkCode(db: Db, userId: string) {
  const cfg = await getWhatsAppConfig(db);
  if (!cfg.businessNumber) throw new AppError(503, "UNAVAILABLE", "WhatsApp isn't available yet. Please check back soon.");
  const code = makeLinkCode(randomBytes(6));
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.insert(whatsappLinkCodes).values({ userId, codeHash: hashCode(code), expiresAt })
    .onConflictDoUpdate({ target: whatsappLinkCodes.userId, set: { codeHash: hashCode(code), expiresAt } });
  return { code, expiresAt, link: `https://wa.me/${cfg.businessNumber}?text=${encodeURIComponent(`LINK ${code}`)}` };
}

export async function unlinkWhatsApp(db: Db, userId: string) {
  const [l] = await db.delete(whatsappLinks).where(eq(whatsappLinks.userId, userId)).returning();
  if (l) await db.update(whatsappChats).set({ pending: null, pendingAt: null, history: [] }).where(eq(whatsappChats.phone, l.phone));
  return { ok: true };
}

/** The account linked to a WhatsApp number (null if none, or the account is suspended). */
export async function userForPhone(db: Db, phone: string) {
  const [r] = await db.select({ id: users.id, name: users.name, email: users.email, suspendedAt: users.suspendedAt })
    .from(whatsappLinks).innerJoin(users, eq(users.id, whatsappLinks.userId)).where(eq(whatsappLinks.phone, phone));
  return r ?? null;
}

async function tryLink(db: Db, phone: string, code: string): Promise<string> {
  if (!(await rateLimit(db, "whatsappLink", phone, { silent: true }))) return "Too many tries. Please wait an hour and get a new code from Settings on the website.";
  const [row] = await db.select().from(whatsappLinkCodes).where(and(eq(whatsappLinkCodes.codeHash, hashCode(code)), gt(whatsappLinkCodes.expiresAt, new Date())));
  if (!row) return "That code didn't work or has expired. Open Settings → WhatsApp on almightypumps.com to get a new one.";
  return completeLink(db, phone, row.userId);
}

/** Connect this number to the account (replaces any older link of either), and tell the owner by email. */
async function completeLink(db: Db, phone: string, userId: string): Promise<string> {
  const [u] = await db.select({ name: users.name, email: users.email, suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, userId));
  if (!u || u.suspendedAt) return "This account can't be linked. Please contact support@almightypumps.com.";
  await db.transaction(async (tx) => {
    await tx.delete(whatsappLinkCodes).where(eq(whatsappLinkCodes.userId, userId));
    await tx.delete(whatsappLinks).where(sql`${whatsappLinks.userId} = ${userId} or ${whatsappLinks.phone} = ${phone}`);
    await tx.insert(whatsappLinks).values({ phone, userId });
    await tx.insert(whatsappChats).values({ phone }).onConflictDoUpdate({ target: whatsappChats.phone, set: { history: [], pending: null, pendingAt: null } });
  });
  if (emailConfigured()) {
    const lines = [`Hi ${u.name.split(" ")[0]},`, `The WhatsApp number ${maskPhone(phone)} was just connected to your Almighty Pumps account. It can now check your balance and buy from your wallet (each purchase needs a YES).`, `If this wasn't you, open Settings → WhatsApp on the website and tap Unlink, then change your password.`];
    void sendEmail(u.email, "WhatsApp connected to your account", lines.join("\n\n"), `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111"><p style="font-weight:700;letter-spacing:.08em">ALMIGHTY PUMPS</p>${lines.map((l) => `<p>${l.replace(/[<>&"']/g, "")}</p>`).join("")}</div>`).catch(() => undefined);
  }
  return `Done, ${u.name.split(" ")[0]}. This WhatsApp number is now linked to your Almighty Pumps account.\n\nYou can ask me for your balance, check orders, or buy airtime, data, Boost, gift cards and travel eSIMs from your wallet. I'll always ask you to reply YES before I spend anything.\n\nTo unlink, go to Settings → WhatsApp on the website, or send UNLINK.`;
}

/* ---------------- Connect by email (inside WhatsApp) ---------------- */

type LinkPending = { kind: "link"; userId: string | null; codeHash: string; tries: number };
const SAME_REPLY = (email: string) => `If ${email} has an Almighty Pumps account, we've just emailed it a 6-digit code. Type the code here to connect this WhatsApp number. It works for 10 minutes.\n\nNever share that code with anyone. Our staff will never ask for it.`;

async function startEmailLink(db: Db, phone: string, email: string): Promise<string> {
  if (!emailConfigured()) return "Connecting by email isn't available right now. Log in at almightypumps.com, open Settings → WhatsApp and tap Link WhatsApp instead.";
  if (!(await rateLimit(db, "whatsappLink", phone, { silent: true }))) return "Too many tries. Please wait an hour, or connect from Settings → WhatsApp on the website.";
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, suspendedAt: users.suspendedAt, verified: users.emailVerifiedAt }).from(users).where(sql`lower(${users.email}) = ${email}`);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Unknown or blocked emails get the same reply (no way to test which emails have accounts); their code can never match.
  const real = !!u && !u.suspendedAt && !!u.verified && (await rateLimit(db, "whatsappEmail", email, { silent: true }));
  const pending: LinkPending = { kind: "link", userId: real ? u!.id : null, codeHash: hashCode(`${phone}:${real ? code : randomBytes(8).toString("hex")}`), tries: 0 };
  await db.insert(whatsappChats).values({ phone, pending, pendingAt: new Date() })
    .onConflictDoUpdate({ target: whatsappChats.phone, set: { pending, pendingAt: new Date() } });
  if (real) {
    const first = u!.name.split(" ")[0];
    const text = `Hi ${first},\n\nSomeone asked to connect the WhatsApp number ${maskPhone(phone)} to your Almighty Pumps account. If that's you, type this code in that WhatsApp chat: ${code}\n\nIt expires in 10 minutes. Never share it with anyone, including people saying they're from Almighty Pumps. If this wasn't you, ignore this email.\n\nAlmighty Pumps · support@almightypumps.com`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<p style="font-weight:700;letter-spacing:.08em;margin:0 0 24px">ALMIGHTY PUMPS</p>
<p>Hi ${first.replace(/[<>&"']/g, "")},</p>
<p>Someone asked to connect the WhatsApp number <strong>${maskPhone(phone)}</strong> to your Almighty Pumps account. If that's you, type this code in that WhatsApp chat:</p>
<p style="font-size:34px;font-weight:700;letter-spacing:.2em;margin:16px 0;font-family:'Courier New',monospace">${code}</p>
<p style="color:#b42318"><strong>Never share this code with anyone</strong>, including people saying they're from Almighty Pumps.</p>
<p style="color:#555">It expires in 10 minutes. If this wasn't you, ignore this email.</p></div>`;
    await sendEmail(u!.email, `${code} is your code to connect WhatsApp`, text, html).catch((e) => console.error("[whatsapp] link email", e));
  }
  return SAME_REPLY(email);
}

async function checkEmailCode(db: Db, phone: string, pending: LinkPending, pendingAt: Date, code: string): Promise<string> {
  if (Date.now() - pendingAt.getTime() > 10 * 60_000) {
    await db.update(whatsappChats).set({ pending: null, pendingAt: null }).where(eq(whatsappChats.phone, phone));
    return "That code has expired. Type your account email again to get a new one.";
  }
  const ok = pending.userId && pending.codeHash === hashCode(`${phone}:${code}`);
  if (!ok) {
    const tries = pending.tries + 1;
    await db.update(whatsappChats).set(tries >= 5 ? { pending: null, pendingAt: null } : { pending: { ...pending, tries } }).where(eq(whatsappChats.phone, phone));
    return tries >= 5 ? "Too many wrong codes. Type your account email again to get a new one." : "That code isn't right. Check the email and try again.";
  }
  return completeLink(db, phone, pending.userId!);
}

/* ---------------- Incoming ---------------- */

/** Handle one webhook body (already signature-checked). Runs after the 200 has been sent to Meta. */
export async function handleWhatsAppWebhook(db: Db, body: unknown) {
  for (const m of parseWebhook(body)) {
    try { await handleOne(db, m); } catch (e) { console.error("[whatsapp] message failed", m.waId, e); }
  }
}

async function handleOne(db: Db, m: WaIncoming) {
  // Meta can deliver the same message twice: the unique wa_id makes the second one a no-op.
  const linked = await userForPhone(db, m.from);
  const [fresh] = await db.insert(whatsappMessages).values({ waId: m.waId, phone: m.from, userId: linked?.id ?? null, direction: "in", body: m.text ?? `[${m.type}]` })
    .onConflictDoNothing().returning({ id: whatsappMessages.id });
  if (!fresh) return;
  await db.insert(whatsappChats).values({ phone: m.from, lastInAt: new Date() }).onConflictDoUpdate({ target: whatsappChats.phone, set: { lastInAt: new Date() } });
  void markRead(db, m.waId);

  if (!m.text) return sendWhatsApp(db, m.from, "I can only read text messages for now. Please type your question.", linked?.id ?? null);
  const code = parseLinkCommand(m.text);
  if (code) return sendWhatsApp(db, m.from, await tryLink(db, m.from, code), linked?.id ?? null);
  if (/^\s*unlink\s*\.?\s*$/i.test(m.text)) {
    if (linked) await unlinkWhatsApp(db, linked.id);
    return sendWhatsApp(db, m.from, linked ? "Unlinked. This number is no longer connected to your account." : "This number isn't linked to an account.");
  }
  if (!linked) {
    const email = asEmail(m.text);
    if (email) return sendWhatsApp(db, m.from, await startEmailLink(db, m.from, email));
    const six = asSixDigits(m.text);
    if (six) {
      const [chat] = await db.select({ pending: whatsappChats.pending, pendingAt: whatsappChats.pendingAt }).from(whatsappChats).where(eq(whatsappChats.phone, m.from));
      const p = chat?.pending as LinkPending | null;
      if (p?.kind === "link" && chat?.pendingAt) return sendWhatsApp(db, m.from, await checkEmailCode(db, m.from, p, chat.pendingAt, six));
    }
  }
  if (linked?.suspendedAt) return sendWhatsApp(db, m.from, "This account is suspended. Please email support@almightypumps.com.", linked.id);

  const { replyToCustomer } = await import("./whatsappAgent");
  await replyToCustomer(db, { phone: m.from, text: m.text, profileName: m.name, user: linked });
}

/* ---------------- Admin ---------------- */

const lagosDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

export async function todaysUsage(db: Db) {
  const [u] = await db.select().from(whatsappAiUsage).where(eq(whatsappAiUsage.day, lagosDay()));
  return { replies: u?.replies ?? 0, costUsd: (u?.costMicroUsd ?? 0) / 1_000_000 };
}

export async function recordUsage(db: Db, costMicroUsd: number, inputTokens: number, outputTokens: number, replies: number) {
  await db.insert(whatsappAiUsage).values({ day: lagosDay(), replies, inputTokens, outputTokens, costMicroUsd })
    .onConflictDoUpdate({ target: whatsappAiUsage.day, set: {
      replies: sql`${whatsappAiUsage.replies} + ${replies}`, inputTokens: sql`${whatsappAiUsage.inputTokens} + ${inputTokens}`,
      outputTokens: sql`${whatsappAiUsage.outputTokens} + ${outputTokens}`, costMicroUsd: sql`${whatsappAiUsage.costMicroUsd} + ${costMicroUsd}`,
    } });
}

export async function whatsappAdminOverview(db: Db) {
  const [cfg, today, linkedCount, week, recent] = await Promise.all([
    getWhatsAppConfig(db), todaysUsage(db),
    db.select({ n: sql<number>`count(*)::int` }).from(whatsappLinks),
    db.select().from(whatsappAiUsage).orderBy(desc(whatsappAiUsage.day)).limit(14),
    db.select({ m: whatsappMessages, name: users.name, email: users.email }).from(whatsappMessages)
      .leftJoin(users, eq(users.id, whatsappMessages.userId)).orderBy(desc(whatsappMessages.createdAt)).limit(80),
  ]);
  return {
    config: cfg, setup: setupStatus(), today, linked: linkedCount[0].n,
    days: week.map((d) => ({ day: d.day, replies: d.replies, costUsd: d.costMicroUsd / 1_000_000 })),
    messages: recent.map((r) => ({ id: r.m.id, phone: maskPhone(r.m.phone), direction: r.m.direction, body: r.m.body, at: r.m.createdAt, customer: r.name ? { id: r.m.userId, name: r.name, email: r.email } : null })),
  };
}
