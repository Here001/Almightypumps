/**
 * Free "check my phone" for US eSIMs: a customer sends their IMEI before paying anything; an admin checks it with the
 * supplier and answers. An IMEI someone already had checked in the last 90 days is answered at once from that result.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { checkImei } from "@/core/esim";
import { alertAdmins } from "./adminAlerts";
import type { Db } from "./db";
import { imeiChecks, users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";
import { badRequest, notFound } from "./errors";

const MAX_PENDING = 3;
const view = (c: typeof imeiChecks.$inferSelect) => ({ id: c.id, publicId: c.publicId, imei: c.imei, status: c.status, note: c.note, createdAt: c.createdAt, checkedAt: c.checkedAt });

export async function myImeiChecks(db: Db, userId: string) {
  const rows = await db.select().from(imeiChecks).where(eq(imeiChecks.userId, userId)).orderBy(desc(imeiChecks.createdAt)).limit(8);
  return rows.map(view);
}

export async function requestImeiCheck(db: Db, userId: string, raw: string) {
  const r = checkImei(raw);
  if ("error" in r) throw badRequest(r.error);
  const [mine] = await db.select().from(imeiChecks).where(and(eq(imeiChecks.userId, userId), eq(imeiChecks.imei, r.imei))).orderBy(desc(imeiChecks.createdAt)).limit(1);
  if (mine && (mine.status === "pending" || (mine.checkedAt && mine.checkedAt.getTime() > Date.now() - 90 * 86_400_000))) return { ...view(mine), again: true };
  const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(imeiChecks).where(and(eq(imeiChecks.userId, userId), eq(imeiChecks.status, "pending")));
  if (open.n >= MAX_PENDING) throw badRequest(`You have ${MAX_PENDING} phones being checked. Wait for an answer before sending another.`);
  // Someone else had this exact phone checked recently: same answer, straight away.
  const [known] = await db.select().from(imeiChecks)
    .where(and(eq(imeiChecks.imei, r.imei), sql`${imeiChecks.status} <> 'pending'`, sql`${imeiChecks.checkedAt} > now() - interval '90 days'`))
    .orderBy(desc(imeiChecks.checkedAt)).limit(1);
  const [row] = await db.insert(imeiChecks).values(known
    ? { userId, imei: r.imei, status: known.status, note: known.note, checkedBy: known.checkedBy, checkedAt: new Date() }
    : { userId, imei: r.imei }).returning();
  if (!known) alertAdmins(db, `Phone to check for a US eSIM (#C-${row.publicId})`, [
    "A customer wants to know if their phone works with your US eSIM before paying.",
    `IMEI: ${r.imei}`,
    "Check it with your supplier, then answer “Works” or “Doesn't work” on the eSIMs page.",
  ], "/admin/esim", { customerId: userId });
  return { ...view(row), again: false };
}

export async function imeiChecksForAdmin(db: Db, which: "pending" | "done") {
  return db.select({
    id: imeiChecks.id, publicId: imeiChecks.publicId, imei: imeiChecks.imei, status: imeiChecks.status, note: imeiChecks.note,
    createdAt: imeiChecks.createdAt, checkedAt: imeiChecks.checkedAt, userId: users.id, name: users.name, email: users.email,
  }).from(imeiChecks).innerJoin(users, eq(users.id, imeiChecks.userId))
    .where(which === "pending" ? eq(imeiChecks.status, "pending") : sql`${imeiChecks.status} <> 'pending'`)
    .orderBy(which === "pending" ? imeiChecks.createdAt : desc(imeiChecks.checkedAt)).limit(100);
}

export async function answerImeiCheck(db: Db, id: string, adminId: string, ok: boolean, note: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Phone check");
  const text = note.trim();
  if (text.length > 500) throw badRequest("Keep the note under 500 characters.");
  if (!ok && text.length < 3) throw badRequest("Tell the customer why it doesn't work (e.g. phone is locked to a network, or has no eSIM).");
  const [c] = await db.update(imeiChecks).set({ status: ok ? "compatible" : "incompatible", note: text || null, checkedBy: adminId, checkedAt: new Date() })
    .where(and(eq(imeiChecks.id, id), eq(imeiChecks.status, "pending"))).returning();
  if (!c) throw badRequest("This check was already answered. Refresh the page.");
  // Everyone waiting on the same phone gets the same answer.
  const others = await db.update(imeiChecks).set({ status: c.status, note: c.note, checkedBy: adminId, checkedAt: new Date() })
    .where(and(eq(imeiChecks.imei, c.imei), eq(imeiChecks.status, "pending"))).returning({ userId: imeiChecks.userId });
  void (async () => {
    try {
      for (const uid of new Set([c.userId, ...others.map((o) => o.userId)])) {
        const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, uid));
        if (!u) continue;
        await sendNotice([u.email], ok ? "Good news: your phone works with our US eSIM" : "Your phone can't use our US eSIM", [
          `We checked the phone with IMEI ending ${c.imei.slice(-4)}.`,
          ok ? "It works with our US eSIM. You can order whenever you're ready." : "Sorry, it won't work with our US eSIM, so please don't order for this phone.",
          ...(c.note ? [`Note from our team: ${c.note}`] : []),
        ], { href: `${(env().APP_URL || "https://almightypumps.com").replace(/\/+$/, "")}/dashboard#esim`, label: ok ? "Order my eSIM" : "Open eSIMs" });
      }
    } catch (e) { console.error("[imei-check] notify", e); }
  })();
  return view(c);
}
