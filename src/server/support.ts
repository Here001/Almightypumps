/**
 * Support chat: one conversation per customer. Customers write from the chat bubble on their dashboard; admins answer
 * from Admin → Support. Emails: admins when a customer writes after the inbox was clear, the customer when an admin
 * replies and they hadn't read the last reply yet (no email storm for back-and-forth chatting).
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { supportMessages, supportThreads, users, wallets } from "./db/schema";
import { badRequest, notFound } from "./errors";
import { sendNotice } from "./email";
import { env } from "./env";


const MAX = 2000;
const clean = (body: string) => {
  const t = body.replace(/\r\n/g, "\n").trim();
  if (!t) throw badRequest("Type a message first.");
  if (t.length > MAX) throw badRequest(`Messages can be up to ${MAX} characters.`);
  return t;
};

async function threadFor(db: Db, userId: string) {
  const [t] = await db.select().from(supportThreads).where(eq(supportThreads.userId, userId));
  return t ?? null;
}

const view = (m: typeof supportMessages.$inferSelect, adminName?: string | null) => ({
  id: m.id, from: m.sender, body: m.body, at: m.createdAt, by: m.sender === "admin" ? (adminName ? adminName.split(" ")[0] : "Support") : null,
});

async function messagesOf(db: Db, threadId: string) {
  const rows = await db.select({ m: supportMessages, adminName: users.name }).from(supportMessages)
    .leftJoin(users, eq(users.id, supportMessages.adminId))
    .where(eq(supportMessages.threadId, threadId)).orderBy(asc(supportMessages.createdAt)).limit(300);
  return rows.map((r) => view(r.m, r.adminName));
}

/** Customer: my conversation (marks admin replies as read). */
export async function myConversation(db: Db, userId: string, markRead = true) {
  const t = await threadFor(db, userId);
  if (!t) return { messages: [], unread: false, status: "open" as const };
  if (markRead && t.unreadCustomer) await db.update(supportThreads).set({ unreadCustomer: false }).where(eq(supportThreads.id, t.id));
  return { messages: await messagesOf(db, t.id), unread: markRead ? false : t.unreadCustomer, status: t.status };
}

/** Customer: is there an unread reply? (for the dot on the chat bubble) */
export async function hasUnreadReply(db: Db, userId: string) {
  const t = await threadFor(db, userId);
  return !!t?.unreadCustomer;
}

/** Customer writes. Re-opens a closed conversation. */
export async function customerSend(db: Db, userId: string, body: string) {
  const text = clean(body);
  const { thread, notify } = await db.transaction(async (tx) => {
    await tx.insert(supportThreads).values({ userId }).onConflictDoNothing();
    const [t] = await tx.select().from(supportThreads).where(eq(supportThreads.userId, userId)).for("update");
    await tx.insert(supportMessages).values({ threadId: t.id, sender: "customer", body: text });
    await tx.update(supportThreads).set({ unreadAdmin: true, status: "open", lastMessageAt: new Date() }).where(eq(supportThreads.id, t.id));
    return { thread: t, notify: !t.unreadAdmin };
  });
  if (notify) void emailAdmins(db, userId, text);
  return { ok: true, threadId: thread.id };
}

async function emailAdmins(db: Db, userId: string, text: string) {
  try {
    const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
    const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
    await sendNotice(admins.map((a) => a.email), `New support message from ${u?.name ?? "a customer"}`, [
      `${u?.name ?? "A customer"} (${u?.email ?? ""}) wrote:`,
      `“${text.length > 500 ? text.slice(0, 500) + "…" : text}”`,
    ], { href: `${env().APP_URL.replace(/\/+$/, "")}/admin/support`, label: "Reply in admin" });
  } catch (e) { console.error("[support] admin email", e); }
}

/* ---------------- admin ---------------- */

export async function inbox(db: Db, opts: { filter?: "open" | "closed" | "all"; q?: string }) {
  const filter = opts.filter ?? "open";
  const q = (opts.q ?? "").trim().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`; // search text is data, wildcards included
  const rows = await db.select({
    id: supportThreads.id, status: supportThreads.status, unread: supportThreads.unreadAdmin, lastAt: supportThreads.lastMessageAt,
    userId: users.id, name: users.name, email: users.email,
    last: sql<string>`(select m.body from support_messages m where m.thread_id = "support_threads"."id" order by m.created_at desc limit 1)`,
    lastFrom: sql<string>`(select m.sender from support_messages m where m.thread_id = "support_threads"."id" order by m.created_at desc limit 1)`,
  }).from(supportThreads).innerJoin(users, eq(users.id, supportThreads.userId))
    .where(and(
      filter === "all" ? undefined : eq(supportThreads.status, filter),
      q ? sql`(${users.name} ilike ${like} or ${users.email} ilike ${like})` : undefined,
    ))
    .orderBy(desc(supportThreads.unreadAdmin), desc(supportThreads.lastMessageAt)).limit(100);
  return rows.map((r) => ({ ...r, last: (r.last ?? "").slice(0, 140) }));
}

/** Admin: one conversation, with the customer's basics (marks it read). */
export async function adminConversation(db: Db, threadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw notFound("Conversation");
  const [t] = await db.select().from(supportThreads).where(eq(supportThreads.id, threadId));
  if (!t) throw notFound("Conversation");
  if (t.unreadAdmin) await db.update(supportThreads).set({ unreadAdmin: false }).where(eq(supportThreads.id, t.id));
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, createdAt: users.createdAt, available: wallets.available, held: wallets.held })
    .from(users).leftJoin(wallets, eq(wallets.userId, users.id)).where(eq(users.id, t.userId));
  return { id: t.id, status: t.status, customer: u ? { ...u, available: Number(u.available ?? 0), held: Number(u.held ?? 0) } : null, messages: await messagesOf(db, t.id) };
}

export async function adminReply(db: Db, adminId: string, threadId: string, body: string) {
  const text = clean(body);
  const res = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportThreads).where(eq(supportThreads.id, threadId)).for("update");
    if (!t) throw notFound("Conversation");
    await tx.insert(supportMessages).values({ threadId: t.id, sender: "admin", adminId, body: text });
    await tx.update(supportThreads).set({ unreadCustomer: true, unreadAdmin: false, status: "open", lastMessageAt: new Date() }).where(eq(supportThreads.id, t.id));
    return { userId: t.userId, notify: !t.unreadCustomer };
  });
  // Email only when they had read everything before (so a quick back-and-forth isn't 10 emails).
  if (res.notify) alertSupportReply(db, res.userId, text);
  return { ok: true };
}

function alertSupportReply(db: Db, userId: string, text: string) {
  // Support replies are always emailed (they're not order marketing), via the same helper with a fixed link.
  void (async () => {
    try {
      const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
      if (!u) return;
      await sendNotice([u.email], "Almighty Pumps support replied", [
        `Hi ${u.name.trim().split(/\s+/)[0] || "there"},`, "We've replied to your message:", `“${text.length > 600 ? text.slice(0, 600) + "…" : text}”`,
      ], { href: `${env().APP_URL.replace(/\/+$/, "")}/dashboard#support`, label: "Open the chat" });
    } catch (e) { console.error("[support] reply email", e); }
  })();
}


export async function setThreadStatus(db: Db, threadId: string, status: "open" | "closed") {
  const r = await db.update(supportThreads).set({ status, unreadAdmin: status === "closed" ? false : undefined }).where(eq(supportThreads.id, threadId)).returning({ id: supportThreads.id });
  if (!r.length) throw notFound("Conversation");
  return { ok: true };
}

/** Admin: start (or continue) a conversation with a customer, e.g. from their Users page. */
export async function adminStartWith(db: Db, adminId: string, userId: string, body: string) {
  await db.insert(supportThreads).values({ userId }).onConflictDoNothing();
  const [t] = await db.select({ id: supportThreads.id }).from(supportThreads).where(eq(supportThreads.userId, userId));
  await adminReply(db, adminId, t.id, body);
  return { threadId: t.id };
}

export async function unreadSupportCount(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(supportThreads).where(eq(supportThreads.unreadAdmin, true));
  return n;
}
