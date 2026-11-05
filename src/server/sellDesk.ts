/**
 * "Sell Gift Cards & Crypto": customers sell to the business for Naira (manual review).
 * Admin sets the cards and coins it buys and its rates (₦ per 1 unit of the card's currency / per US$1 of crypto).
 * Customer submits (gift card: e-code and/or photos; crypto: sends to the admin's address + transaction hash) →
 * admins are emailed → admin checks, then Approve (wallet credited, amount editable) or Reject with a reason.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { tradeInImages, tradeIns, users } from "./db/schema";
import { sendNotice } from "./email";
import { decodeImage } from "./images";
import { env } from "./env";
import { badRequest, notFound } from "./errors";
import { creditWallet, walletIdForUser } from "./wallet";

const id = z.string().regex(/^[a-z0-9-]{3,40}$/);
const naira = z.number().int().min(0).max(100_000_000); // kobo per unit (₦1,000,000 max)

export const cardSchema = z.object({
  id, enabled: z.boolean().default(true),
  name: z.string().trim().min(2, "Name the card").max(60),           // "Amazon (USA)"
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency, e.g. USD"),
  physicalRateKobo: naira,                                             // ₦ per 1 unit for physical cards (0 = not accepted)
  ecodeRateKobo: naira,                                                // ₦ per 1 unit for e-codes (0 = not accepted)
  min: z.number().min(1).max(100_000).default(10),
  max: z.number().min(1).max(100_000).default(1000),
  note: z.string().trim().max(400).default(""),                        // e.g. "No receipts needed. $25–$500 only."
});
export const coinSchema = z.object({
  id, enabled: z.boolean().default(true),
  coin: z.string().trim().toUpperCase().min(2).max(12),
  network: z.string().trim().min(2).max(40),
  address: z.string().trim().min(20, "Paste the full wallet address").max(200),
  rateKobo: naira.refine((v) => v > 0, "Set your buy rate"),           // ₦ per US$1 worth
  min: z.number().min(1).max(1_000_000).default(10),                   // US$
  note: z.string().trim().max(400).default(""),
});
export const sellConfigSchema = z.object({
  enabled: z.boolean(),
  dailyLimitKobo: z.number().int().min(0).max(10_000_000_000),         // per customer per day (0 = no limit)
  cards: z.array(cardSchema).max(80),
  coins: z.array(coinSchema).max(20),
});
export type SellConfig = z.output<typeof sellConfigSchema>;
const DEFAULTS: SellConfig = { enabled: false, dailyLimitKobo: 50_000_000, cards: [], coins: [] };

export const getSellConfig = (db: Db) => readSetting(db, "sell_desk", DEFAULTS);

export async function saveSellConfig(db: Db, cfg: SellConfig) {
  for (const c of cfg.cards) {
    if (!c.physicalRateKobo && !c.ecodeRateKobo) throw badRequest(`“${c.name}”: set a rate for physical cards, e-codes, or both.`);
    if (c.min > c.max) throw badRequest(`“${c.name}”: the minimum is above the maximum.`);
  }
  const ids = [...cfg.cards.map((c) => c.id), ...cfg.coins.map((c) => c.id)];
  if (new Set(ids).size !== ids.length) throw badRequest("Two items have the same id.");
  return writeSetting(db, "sell_desk", cfg);
}

const STABLE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|PYUSD)$/;
const fmt = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const payout = (value: number, rateKobo: number) => Math.floor(value * rateKobo);

/* ---------- Customer ---------- */

export async function sellOverview(db: Db, userId: string) {
  const cfg = await getSellConfig(db);
  const rows = await db.select().from(tradeIns).where(eq(tradeIns.userId, userId)).orderBy(desc(tradeIns.createdAt)).limit(20);
  return {
    enabled: cfg.enabled,
    dailyLimitKobo: cfg.dailyLimitKobo,
    cards: cfg.enabled ? cfg.cards.filter((c) => c.enabled).map(({ enabled: _e, ...c }) => c) : [],
    coins: cfg.enabled ? await Promise.all(cfg.coins.filter((c) => c.enabled).map(async ({ enabled: _e, ...c }) => ({
      ...c, stable: STABLE.test(c.coin),
      qr: `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(c.address, { type: "svg", margin: 1 })).toString("base64")}`,
    }))) : [],
    trades: rows.map((t) => ({
      id: t.id, publicId: t.publicId, kind: t.kind, item: t.itemLabel, value: Number(t.value), currency: t.currency,
      payoutKobo: t.payoutKobo, status: t.status, paidKobo: t.paidKobo, reason: t.status === "rejected" ? t.adminNote : null, createdAt: t.createdAt,
    })),
  };
}

const imageSchema = z.string().max(700_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload JPG, PNG or WebP pictures");
export const submitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("giftcard"), itemId: id, form: z.enum(["ecode", "physical"]), value: z.number().positive().max(100_000),
    code: z.string().trim().max(500).default(""), note: z.string().trim().max(500).default(""), images: z.array(imageSchema).max(4).default([]),
  }),
  z.object({
    kind: z.literal("crypto"), itemId: id, value: z.number().positive().max(1_000_000),
    txHash: z.string().trim().min(10, "Paste the transaction hash").max(200), note: z.string().trim().max(500).default(""),
  }),
]);


export async function submitTradeIn(db: Db, user: { id: string; name: string; email: string }, input: z.output<typeof submitSchema>) {
  const cfg = await getSellConfig(db);
  if (!cfg.enabled) throw badRequest("Selling is paused right now. Please check back soon.");
  let label: string, currency: string, rateKobo: number, proof: string, form: "ecode" | "physical" | null = null;
  if (input.kind === "giftcard") {
    const c = cfg.cards.find((x) => x.id === input.itemId && x.enabled);
    if (!c) throw badRequest("We're not buying that card right now. Please refresh the page.");
    rateKobo = input.form === "ecode" ? c.ecodeRateKobo : c.physicalRateKobo;
    if (!rateKobo) throw badRequest(`We only buy ${c.name} as ${input.form === "ecode" ? "physical cards" : "e-codes"}.`);
    if (input.value < c.min || input.value > c.max) throw badRequest(`${c.name}: we buy cards from ${c.min} to ${c.max} ${c.currency}.`);
    if (input.form === "ecode" && input.code.length < 4) throw badRequest("Enter the gift card code.");
    if (input.form === "physical" && input.images.length === 0) throw badRequest("Add a clear photo of the card (front, and the back with the code showing).");
    label = `${c.name} · ${input.form === "ecode" ? "e-code" : "physical card"}`;
    currency = c.currency; proof = input.code; form = input.form;
  } else {
    const c = cfg.coins.find((x) => x.id === input.itemId && x.enabled);
    if (!c) throw badRequest("We're not buying that coin right now. Please refresh the page.");
    if (input.value < c.min) throw badRequest(`The minimum is $${c.min} worth of ${c.coin}.`);
    label = `${c.coin} · ${c.network}`; currency = "USD"; rateKobo = c.rateKobo; proof = input.txHash;
  }
  const amount = payout(input.value, rateKobo);
  if (amount < 100) throw badRequest("That amount is too small.");
  // The same code / transaction can't be sold twice.
  if (proof) {
    const [dup] = await db.select({ id: tradeIns.id }).from(tradeIns)
      .where(and(sql`lower(${tradeIns.proof}) = ${proof.toLowerCase()}`, inArray(tradeIns.status, ["pending", "paid"]))).limit(1);
    if (dup) throw badRequest(input.kind === "crypto" ? "That transaction has already been submitted." : "That gift card code has already been submitted.");
  }
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(tradeIns).where(and(eq(tradeIns.userId, user.id), eq(tradeIns.status, "pending")));
  if (busy.n >= 5) throw badRequest("You have 5 trades waiting to be checked. Please wait for those first.");
  if (cfg.dailyLimitKobo > 0) {
    const [today] = await db.select({ k: sql<number>`coalesce(sum(${tradeIns.payoutKobo}), 0)::bigint` }).from(tradeIns)
      .where(and(eq(tradeIns.userId, user.id), inArray(tradeIns.status, ["pending", "paid"]), gte(tradeIns.createdAt, new Date(Date.now() - 86_400_000))));
    if (Number(today.k) + amount > cfg.dailyLimitKobo) throw badRequest(`You can sell up to ${fmt(cfg.dailyLimitKobo)} in 24 hours. Try a smaller amount or come back later.`);
  }
  const images = input.kind === "giftcard" ? input.images.map((d) => decodeImage(d)) : [];
  const t = await db.transaction(async (tx) => {
    const [row] = await tx.insert(tradeIns).values({
      userId: user.id, kind: input.kind, itemId: input.itemId, itemLabel: label, cardForm: form, value: String(input.value), currency,
      rateKobo, payoutKobo: amount, proof, note: input.note,
    }).returning();
    if (images.length) await tx.insert(tradeInImages).values(images.map((i) => ({ tradeInId: row.id, ...i })));
    return row;
  });
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
  await sendNotice(admins.map((a) => a.email), `To check: ${label} ${input.value} ${currency} → ${fmt(amount)} (#S-${t.publicId})`, [
    `${user.name} (${user.email}) wants to sell ${label}: ${input.value} ${currency}.`,
    input.kind === "crypto" ? `They say they sent it. Transaction: ${proof}` : form === "ecode" ? `E-code: ${proof}` : `${images.length} photo(s) attached in the admin.`,
    `If it checks out, approve to pay ${fmt(amount)} into their wallet.`,
  ], { href: `${env().APP_URL.replace(/\/+$/, "")}/admin/sell`, label: "Open trades to check" }).catch((e) => console.error("[sell] admin email", e));
  return { id: t.id, publicId: t.publicId, payoutKobo: amount, status: t.status };
}

/* ---------- Admin ---------- */

export async function sellAdminOverview(db: Db) {
  const cfg = await getSellConfig(db);
  const rows = await db.select({ t: tradeIns, email: users.email, name: users.name, joined: users.createdAt })
    .from(tradeIns).innerJoin(users, eq(users.id, tradeIns.userId))
    .orderBy(sql`(${tradeIns.status} = 'pending') desc`, desc(tradeIns.createdAt)).limit(100);
  const imgs = rows.length ? await db.select({ id: tradeInImages.id, tradeInId: tradeInImages.tradeInId }).from(tradeInImages).where(inArray(tradeInImages.tradeInId, rows.map((r) => r.t.id))) : [];
  return {
    config: cfg,
    trades: rows.map(({ t, email, name, joined }) => ({
      id: t.id, publicId: t.publicId, kind: t.kind, item: t.itemLabel, form: t.cardForm, value: Number(t.value), currency: t.currency,
      rateKobo: t.rateKobo, payoutKobo: t.payoutKobo, proof: t.proof, note: t.note, status: t.status, paidKobo: t.paidKobo, adminNote: t.adminNote,
      createdAt: t.createdAt, images: imgs.filter((i) => i.tradeInId === t.id).map((i) => `/api/admin/sell/images/${i.id}`),
      customer: { name, email, newAccount: Date.now() - joined.getTime() < 3 * 86_400_000 },
    })),
  };
}

export async function tradeInImage(db: Db, imageId: string) {
  const [i] = await db.select().from(tradeInImages).where(eq(tradeInImages.id, imageId));
  if (!i) throw notFound("Picture");
  return i;
}

export async function approveTradeIn(db: Db, adminId: string, tradeId: string, kobo?: number) {
  const r = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tradeIns).where(eq(tradeIns.id, tradeId)).for("update");
    if (!t) throw notFound("Trade");
    if (t.status !== "pending") throw badRequest("This trade has already been handled.");
    const amount = kobo ?? t.payoutKobo;
    if (!Number.isInteger(amount) || amount <= 0) throw badRequest("Enter the amount to pay.");
    const walletId = await walletIdForUser(tx, t.userId);
    await creditWallet(tx, walletId, amount, `tradein:${t.kind}`, { refType: "trade_in", refId: t.id, memo: `Sold: ${t.itemLabel}`, idempotencyKey: `tradein:${t.id}` });
    await tx.update(tradeIns).set({ status: "paid", paidKobo: amount, decidedBy: adminId, decidedAt: new Date() }).where(eq(tradeIns.id, t.id));
    const [u] = await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, t.userId));
    return { t, amount, u };
  });
  await sendNotice([r.u.email], `${fmt(r.amount)} paid for your ${r.t.itemLabel}`, [
    `Hi ${r.u.name.split(" ")[0]},`, `Your ${r.t.itemLabel} (${Number(r.t.value)} ${r.t.currency}) checked out. We've added ${fmt(r.amount)} to your wallet.`,
  ], { href: `${env().APP_URL.replace(/\/+$/, "")}/dashboard#wallet`, label: "Open my wallet" }).catch(() => null);
  return { paid: r.t.publicId, kobo: r.amount };
}

export async function rejectTradeIn(db: Db, adminId: string, tradeId: string, reason: string) {
  if (reason.trim().length < 3) throw badRequest("Tell the customer why (they see this).");
  const [t] = await db.update(tradeIns).set({ status: "rejected", adminNote: reason.trim(), decidedBy: adminId, decidedAt: new Date() })
    .where(and(eq(tradeIns.id, tradeId), eq(tradeIns.status, "pending"))).returning();
  if (!t) throw badRequest("This trade has already been handled.");
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, t.userId));
  await sendNotice([u.email], `About your ${t.itemLabel}`, [
    `Hi ${u.name.split(" ")[0]},`, `We couldn't accept your ${t.itemLabel} (${Number(t.value)} ${t.currency}).`, `Reason: ${reason.trim()}`,
    "Questions? Reply to support@almightypumps.com.",
  ]).catch(() => null);
  return { rejected: t.publicId };
}
