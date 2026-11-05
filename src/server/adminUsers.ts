/**
 * Admin → Users: find any customer, see their account at a glance, and act on it (suspend, log out everywhere,
 * make admin, confirm email, edit name/phone, add or remove wallet money). Every action is written to admin_actions.
 */
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { adminActions, apiKeys, ledgerEntries, sellerProfiles, trustedDevices, users, wallets } from "./db/schema";
import { badRequest, notFound } from "./errors";
import { creditWallet, debitWallet, walletIdForUser } from "./wallet";

const PAGE = 30;
export type UserFilter = "all" | "admins" | "sellers" | "suspended" | "unverified";

export async function listUsers(db: Db, opts: { q?: string; filter?: UserFilter; page?: number }) {
  const where = [eq(users.isSystem, false)];
  const q = (opts.q ?? "").trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    where.push(or(ilike(users.email, like), ilike(users.name, like), ilike(sql`coalesce(${users.phone}, '')`, like), ilike(sql`coalesce(${users.referralCode}, '')`, like))!);
  }
  if (opts.filter === "admins") where.push(eq(users.role, "admin"));
  if (opts.filter === "sellers") where.push(eq(users.sellerStatus, "verified"));
  if (opts.filter === "suspended") where.push(isNotNull(users.suspendedAt));
  if (opts.filter === "unverified") where.push(isNull(users.emailVerifiedAt));
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const rows = await db.select({
    id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, sellerStatus: users.sellerStatus,
    verified: sql<boolean>`${users.emailVerifiedAt} IS NOT NULL`, suspended: sql<boolean>`${users.suspendedAt} IS NOT NULL`,
    createdAt: users.createdAt, available: wallets.available, held: wallets.held,
  }).from(users).leftJoin(wallets, eq(wallets.userId, users.id))
    .where(and(...where)).orderBy(desc(users.createdAt)).limit(PAGE + 1).offset(page * PAGE);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(and(...where));
  return { users: rows.slice(0, PAGE).map((r) => ({ ...r, available: Number(r.available ?? 0), held: Number(r.held ?? 0) })), hasMore: rows.length > PAGE, total, page };
}

/** Everything about one customer for the admin detail page. */
export async function userDetail(db: Db, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound("Customer");
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.isSystem, false)));
  if (!u) throw notFound("Customer");
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const sums = w ? (await db.select({
    deposited: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.kind} = 'deposit'), 0)::bigint`,
    spent: sql<number>`coalesce(-sum(${ledgerEntries.heldChange}) filter (where ${ledgerEntries.kind} like 'capture:%' and ${ledgerEntries.kind} <> 'capture:withdrawal'), 0)::bigint`,
    withdrawn: sql<number>`coalesce(-sum(${ledgerEntries.heldChange}) filter (where ${ledgerEntries.kind} = 'capture:withdrawal'), 0)::bigint`,
    earned: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.kind} in ('escrow:payout','tradein:giftcard','tradein:crypto','bonus:referral')), 0)::bigint`,
  }).from(ledgerEntries).where(eq(ledgerEntries.walletId, w.id)))[0] : null;
  const activity = w ? await db.select({ id: ledgerEntries.id, kind: ledgerEntries.kind, memo: ledgerEntries.memo, change: ledgerEntries.availableChange, heldChange: ledgerEntries.heldChange, after: ledgerEntries.availableAfter, at: ledgerEntries.createdAt })
    .from(ledgerEntries).where(eq(ledgerEntries.walletId, w.id)).orderBy(desc(ledgerEntries.createdAt)).limit(40) : [];
  const counts = (await db.execute(sql`SELECT
      (SELECT count(*) FROM smm_orders WHERE user_id = ${userId})::int AS boost,
      (SELECT count(*) FROM trades WHERE buyer_id = ${userId} OR seller_id = ${userId})::int AS trades,
      (SELECT count(*) FROM shipments WHERE user_id = ${userId} AND status NOT IN ('quoted','failed'))::int AS packages,
      (SELECT count(*) FROM referrals WHERE referrer_id = ${userId})::int AS invited`)).rows[0] as Record<string, number>;
  const [shop] = await db.select({ name: sellerProfiles.businessName }).from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  const [inviter] = u.referredBy ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, u.referredBy)) : [];
  const [{ keys }] = await db.select({ keys: sql<number>`count(*)::int` }).from(apiKeys).where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  const log = await db.select({ id: adminActions.id, action: adminActions.action, detail: adminActions.detail, at: adminActions.createdAt, by: users.name })
    .from(adminActions).innerJoin(users, eq(users.id, adminActions.adminId)).where(eq(adminActions.userId, userId)).orderBy(desc(adminActions.createdAt)).limit(50);
  return {
    user: {
      id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, sellerStatus: u.sellerStatus, shopName: shop?.name ?? null,
      verified: !!u.emailVerifiedAt, suspendedAt: u.suspendedAt, suspendReason: u.suspendReason, createdAt: u.createdAt, referralCode: u.referralCode,
      inviter: inviter ?? null, apiKeys: keys,
    },
    wallet: { available: Number(w?.available ?? 0), held: Number(w?.held ?? 0) },
    totals: { deposited: Number(sums?.deposited ?? 0), spent: Number(sums?.spent ?? 0), withdrawn: Number(sums?.withdrawn ?? 0), earned: Number(sums?.earned ?? 0) },
    counts: { boost: Number(counts?.boost ?? 0), trades: Number(counts?.trades ?? 0), packages: Number(counts?.packages ?? 0), invited: Number(counts?.invited ?? 0) },
    activity: activity.map((a) => ({ ...a, change: Number(a.change), heldChange: Number(a.heldChange), after: Number(a.after) })),
    log,
  };
}

export const userActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().trim().min(3, "Say why (only admins see this).").max(300) }),
  z.object({ action: z.literal("unsuspend") }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("makeAdmin") }),
  z.object({ action: z.literal("removeAdmin") }),
  z.object({ action: z.literal("verifyEmail") }),
  z.object({ action: z.literal("profile"), name: z.string().trim().min(2, "Enter a name").max(80), phone: z.string().trim().max(20).optional().or(z.literal("")) }),
  z.object({
    action: z.literal("wallet"), direction: z.enum(["add", "remove"]),
    amountKobo: z.number().int().positive("Enter an amount").max(100_000_000_00, "That's too much for one adjustment."),
    reason: z.string().trim().min(5, "Say why. The customer sees this in their wallet history.").max(200),
    requestId: z.string().uuid(),
  }),
]);
export type UserAction = z.infer<typeof userActionSchema>;

const naira = (k: number) => "₦" + (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

/** Apply one admin action to a customer and log it. */
export async function actOnUser(db: Db, adminId: string, userId: string, a: UserAction) {
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.isSystem, false)));
  if (!u) throw notFound("Customer");
  const self = adminId === userId;
  let detail: string | null = null;
  switch (a.action) {
    case "suspend":
      if (self) throw badRequest("You can't suspend your own account.");
      // Suspending also ends every session right away.
      await db.update(users).set({ suspendedAt: new Date(), suspendReason: a.reason, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
      await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
      detail = a.reason;
      break;
    case "unsuspend":
      await db.update(users).set({ suspendedAt: null, suspendReason: null }).where(eq(users.id, userId));
      break;
    case "logout":
      await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
      await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
      break;
    case "makeAdmin":
      if (u.suspendedAt) throw badRequest("Unsuspend this account first.");
      if (!u.emailVerifiedAt) throw badRequest("Their email must be confirmed before they can be an admin.");
      await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
      break;
    case "removeAdmin": {
      if (self) throw badRequest("You can't remove your own admin access.");
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
      if (n <= 1) throw badRequest("There must always be at least one admin.");
      await db.update(users).set({ role: "user", sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
      break;
    }
    case "verifyEmail":
      await db.update(users).set({ emailVerifiedAt: u.emailVerifiedAt ?? new Date() }).where(eq(users.id, userId));
      break;
    case "profile":
      if (a.phone && !/^(\+?234|0)[789]\d{9}$/.test(a.phone.replace(/\s/g, ""))) throw badRequest("Enter a Nigerian phone number, like 0803 123 4567.");
      await db.update(users).set({ name: a.name, phone: a.phone ? a.phone.replace(/\s/g, "") : null }).where(eq(users.id, userId));
      detail = `${u.name} → ${a.name}; phone ${u.phone ?? "none"} → ${a.phone || "none"}`;
      break;
    case "wallet": {
      if (self) throw badRequest("You can't adjust your own wallet. Ask another admin.");
      const memo = `Adjustment by Almighty Pumps: ${a.reason}`;
      const ok = await db.transaction(async (tx) => {
        const walletId = await walletIdForUser(tx, userId);
        const ref = { refType: "admin", refId: adminId, memo, idempotencyKey: `adjust:${a.requestId}` };
        if (a.direction === "add") return creditWallet(tx, walletId, a.amountKobo, "adjust:credit", ref);
        const [w] = await tx.select({ available: wallets.available }).from(wallets).where(eq(wallets.id, walletId));
        if (Number(w?.available ?? 0) < a.amountKobo) throw badRequest(`They only have ${naira(Number(w?.available ?? 0))} available (money held for orders can't be removed).`);
        return debitWallet(tx, walletId, a.amountKobo, "adjust:debit", ref);
      });
      if (!ok) return { ok: true, repeated: true };
      detail = `${a.direction === "add" ? "Added" : "Removed"} ${naira(a.amountKobo)}: ${a.reason}`;
      break;
    }
  }
  await db.insert(adminActions).values({ adminId, userId, action: a.action, detail });
  return { ok: true };
}
