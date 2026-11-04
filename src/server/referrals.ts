/**
 * Referral program ("Invite friends & earn").
 *
 * - Every customer has an invite code (created the first time it's needed) and a link /signup?ref=CODE.
 * - A friend who signs up with the code is linked to them (users.referred_by + a `referrals` row).
 * - Once the friend has SPENT the minimum on paid orders (captured holds; withdrawals don't count) and verified
 *   their email, the inviter gets `bonusKobo` and the friend `friendBonusKobo` (ledger kind `bonus:referral`).
 * - Limits: at most `monthlyCap` paid invites per inviter per 30 days; you can't invite yourself.
 * Checked by the sync-orders cron and whenever the inviter opens the Invite screen.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "./db";
import { ledgerEntries, referrals, users, wallets } from "./db/schema";
import { readSetting, writeSetting } from "./appSettings";
import { creditWallet, walletIdForUser } from "./wallet";
import { env } from "./env";
import { badRequest } from "./errors";

export type ReferralConfig = { enabled: boolean; bonusKobo: number; friendBonusKobo: number; minSpendKobo: number; monthlyCap: number };
export const REFERRAL_DEFAULTS: ReferralConfig = { enabled: false, bonusKobo: 500_00, friendBonusKobo: 200_00, minSpendKobo: 3_000_00, monthlyCap: 30 };

export const referralConfigSchema = z.object({
  enabled: z.boolean(),
  bonusKobo: z.number().int().min(0).max(100_000_00),
  friendBonusKobo: z.number().int().min(0).max(100_000_00),
  minSpendKobo: z.number().int().min(100_00, "The friend must spend at least ₦100 first.").max(10_000_000_00),
  monthlyCap: z.number().int().min(1).max(10_000),
});

export const getReferralConfig = (db: DbOrTx) => readSetting(db, "referrals", REFERRAL_DEFAULTS);
export async function saveReferralConfig(db: Db, cfg: ReferralConfig) {
  if (cfg.bonusKobo + cfg.friendBonusKobo > cfg.minSpendKobo) throw badRequest("The bonuses together can't be more than the friend's minimum spend.");
  return writeSetting(db, "referrals", referralConfigSchema.parse(cfg));
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);

/** The customer's invite code, created on first use. */
export async function referralCodeFor(db: DbOrTx, userId: string): Promise<string> {
  const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
  if (u?.code) return u.code;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const r = await db.execute(sql`UPDATE users SET referral_code = ${code} WHERE id = ${userId} AND referral_code IS NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = ${code}) RETURNING referral_code`);
    if (r.rows.length) return code;
    const [again] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
    if (again?.code) return again.code;
  }
  throw new Error("Couldn't create an invite code. Please try again.");
}

/** Link a new account to whoever's code it signed up with. Silently ignores unknown codes and self-invites. */
export async function linkReferral(db: DbOrTx, newUserId: string, rawCode: string | undefined | null) {
  const code = rawCode ? normaliseCode(rawCode) : "";
  if (!code) return;
  const [ref] = await db.select({ id: users.id, isSystem: users.isSystem }).from(users).where(eq(users.referralCode, code));
  if (!ref || ref.isSystem || ref.id === newUserId) return;
  const [me] = await db.select({ referredBy: users.referredBy }).from(users).where(eq(users.id, newUserId));
  if (!me || me.referredBy) return;
  await db.update(users).set({ referredBy: ref.id }).where(eq(users.id, newUserId));
  await db.insert(referrals).values({ referrerId: ref.id, referredId: newUserId }).onConflictDoNothing();
}

/** How much each of these customers has spent on paid orders (kobo). */
async function spentBy(db: DbOrTx, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: wallets.userId,
      spent: sql<number>`coalesce(-sum(${ledgerEntries.heldChange}) filter (where ${ledgerEntries.kind} like 'capture:%' and ${ledgerEntries.kind} <> 'capture:withdrawal'), 0)::bigint`,
    })
    .from(wallets)
    .leftJoin(ledgerEntries, eq(ledgerEntries.walletId, wallets.id))
    .where(inArray(wallets.userId, userIds))
    .groupBy(wallets.userId);
  return new Map(rows.map((r) => [r.userId, Number(r.spent)]));
}

/** Pay every pending invite whose friend has now spent enough. Returns how many were paid. */
export async function payReferrals(db: Db, onlyReferrer?: string): Promise<{ paid: number }> {
  const cfg = await getReferralConfig(db);
  if (!cfg.enabled) return { paid: 0 };
  const pending = await db
    .select({ id: referrals.id, referrerId: referrals.referrerId, referredId: referrals.referredId, verified: users.emailVerifiedAt })
    .from(referrals)
    .innerJoin(users, eq(users.id, referrals.referredId))
    .where(and(eq(referrals.status, "pending"), onlyReferrer ? eq(referrals.referrerId, onlyReferrer) : undefined))
    .limit(500);
  const spent = await spentBy(db, pending.map((p) => p.referredId));
  let paid = 0;
  for (const p of pending) {
    if (!p.verified || (spent.get(p.referredId) ?? 0) < cfg.minSpendKobo) continue;
    const ok = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(referrals).where(eq(referrals.id, p.id)).for("update");
      if (!row || row.status !== "pending") return false;
      // Lock the inviter so two payouts can't both slip under the monthly cap.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, p.referrerId)).for("update");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(referrals)
        .where(and(eq(referrals.referrerId, p.referrerId), eq(referrals.status, "rewarded"), gte(referrals.rewardedAt, new Date(Date.now() - 30 * 86400_000))));
      if (n >= cfg.monthlyCap) return false; // try again later, when older ones fall out of the 30 days
      if (cfg.bonusKobo > 0) {
        await creditWallet(tx, await walletIdForUser(tx, p.referrerId), cfg.bonusKobo, "bonus:referral",
          { refType: "referral", refId: p.id, memo: "Invite bonus: your friend joined and ordered", idempotencyKey: `referral:${p.id}:inviter` });
      }
      if (cfg.friendBonusKobo > 0) {
        await creditWallet(tx, await walletIdForUser(tx, p.referredId), cfg.friendBonusKobo, "bonus:referral",
          { refType: "referral", refId: p.id, memo: "Welcome bonus for joining with an invite", idempotencyKey: `referral:${p.id}:friend` });
      }
      await tx.update(referrals).set({ status: "rewarded", rewardKobo: cfg.bonusKobo, friendRewardKobo: cfg.friendBonusKobo, rewardedAt: new Date() }).where(eq(referrals.id, p.id));
      return true;
    });
    if (ok) paid++;
  }
  return { paid };
}

function appUrl() {
  return (env().APP_URL || "https://almightypumps.com").replace(/\/+$/, "");
}
const maskName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

/** Everything the customer's Invite screen shows. */
export async function myReferrals(db: Db, userId: string) {
  const cfg = await getReferralConfig(db);
  await payReferrals(db, userId).catch((e) => console.error("[referrals] pay on view", e));
  const code = await referralCodeFor(db, userId);
  const rows = await db
    .select({ id: referrals.id, referredId: referrals.referredId, status: referrals.status, reward: referrals.rewardKobo, createdAt: referrals.createdAt, name: users.name })
    .from(referrals).innerJoin(users, eq(users.id, referrals.referredId))
    .where(eq(referrals.referrerId, userId)).orderBy(desc(referrals.createdAt)).limit(200);
  const spent = await spentBy(db, rows.filter((r) => r.status === "pending").map((r) => r.referredId));
  return {
    enabled: cfg.enabled,
    bonusKobo: cfg.bonusKobo,
    friendBonusKobo: cfg.friendBonusKobo,
    minSpendKobo: cfg.minSpendKobo,
    code,
    link: `${appUrl()}/signup?ref=${code}`,
    earnedKobo: rows.reduce((s, r) => s + (r.status === "rewarded" ? Number(r.reward ?? 0) : 0), 0),
    friends: rows.map((r) => ({
      id: r.id,
      name: maskName(r.name),
      joined: r.createdAt,
      status: r.status,
      rewardKobo: r.reward,
      spentKobo: r.status === "pending" ? Math.min(spent.get(r.referredId) ?? 0, cfg.minSpendKobo) : null,
    })),
  };
}

/** Admin page: settings, totals, top inviters and recent invites. */
export async function referralOverview(db: Db) {
  const config = await getReferralConfig(db);
  const [totals] = await db.select({
    invited: sql<number>`count(*)::int`,
    rewarded: sql<number>`count(*) filter (where ${referrals.status} = 'rewarded')::int`,
    paidKobo: sql<number>`coalesce(sum(coalesce(${referrals.rewardKobo},0) + coalesce(${referrals.friendRewardKobo},0)) filter (where ${referrals.status} = 'rewarded'), 0)::bigint`,
  }).from(referrals);
  const top = await db.select({
    userId: referrals.referrerId, name: users.name, email: users.email,
    invited: sql<number>`count(*)::int`,
    rewarded: sql<number>`count(*) filter (where ${referrals.status} = 'rewarded')::int`,
  }).from(referrals).innerJoin(users, eq(users.id, referrals.referrerId))
    .groupBy(referrals.referrerId, users.name, users.email).orderBy(desc(sql`count(*)`)).limit(20);
  const recent = await db.execute(sql`
    SELECT r.id, r.status, r.reward_kobo, r.friend_reward_kobo, r.note, r.created_at, r.rewarded_at,
      a.name AS inviter_name, a.email AS inviter_email, b.name AS friend_name, b.email AS friend_email
    FROM referrals r JOIN users a ON a.id = r.referrer_id JOIN users b ON b.id = r.referred_id
    ORDER BY r.created_at DESC LIMIT 100`);
  return {
    config,
    totals: { invited: totals.invited, rewarded: totals.rewarded, paidKobo: Number(totals.paidKobo) },
    top,
    recent: (recent.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), status: String(r.status), rewardKobo: r.reward_kobo == null ? null : Number(r.reward_kobo),
      friendRewardKobo: r.friend_reward_kobo == null ? null : Number(r.friend_reward_kobo), note: (r.note as string | null) ?? null,
      createdAt: r.created_at, rewardedAt: r.rewarded_at,
      inviter: { name: String(r.inviter_name), email: String(r.inviter_email) }, friend: { name: String(r.friend_name), email: String(r.friend_email) },
    })),
  };
}

/** Admin: stop a pending invite from paying (e.g. the same person on two accounts). */
export async function voidReferral(db: Db, id: string, note: string) {
  const r = await db.update(referrals).set({ status: "void", note }).where(and(eq(referrals.id, id), eq(referrals.status, "pending"))).returning({ id: referrals.id });
  if (!r.length) throw badRequest("Only invites that haven't been paid can be cancelled.");
  return { ok: true };
}
