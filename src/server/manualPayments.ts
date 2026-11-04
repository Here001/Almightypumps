/**
 * Manual top-ups (bank transfer and crypto) while card payments are pending.
 * The admin lists where to pay (bank accounts, crypto wallets). The customer picks one, sees exactly what to send,
 * pays, and taps "I have made payment" with the transaction ID / sender name. Every admin gets an email; an admin
 * checks the bank app / wallet and confirms (wallet credited, idempotent) or rejects with a reason. The customer is
 * emailed either way.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { manualDeposits, users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { getUsdRateKobo } from "./pricing";
import { creditWallet, walletIdForUser } from "./wallet";

export const methodSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/),
  kind: z.enum(["bank", "crypto"]),
  label: z.string().trim().min(2, "Give the method a name").max(60),
  enabled: z.boolean().default(true),
  bankName: z.string().trim().max(60).default(""),
  accountNumber: z.string().trim().max(30).default(""),
  accountName: z.string().trim().max(80).default(""),
  coin: z.string().trim().toUpperCase().max(12).default(""),
  network: z.string().trim().max(40).default(""),
  address: z.string().trim().max(200).default(""),
  note: z.string().trim().max(500).default(""),
});
export type Method = z.output<typeof methodSchema>;

export const configSchema = z.object({
  enabled: z.boolean(),
  /** Naira per US$1 for crypto; 0 = the site dollar rate. */
  cryptoRateKobo: z.number().int().min(0).max(100_000_000),
  notifyEmails: z.array(z.string().trim().toLowerCase().email()).max(10),
  methods: z.array(methodSchema).max(20),
});
export type ManualConfig = z.output<typeof configSchema>;
const DEFAULTS: ManualConfig = { enabled: true, cryptoRateKobo: 0, notifyEmails: [], methods: [] };

const MAX_KOBO = 500_000_000; // ₦5,000,000 per notice
const STABLE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|PYUSD)$/;

export const getManualConfig = (db: Db) => readSetting(db, "manual_payments", DEFAULTS);

export async function saveManualConfig(db: Db, input: ManualConfig) {
  for (const m of input.methods) {
    if (m.kind === "bank" && (!m.bankName || !/^\d{10}$/.test(m.accountNumber) || m.accountName.length < 3)) throw badRequest(`“${m.label}”: enter the bank, the 10-digit account number and the account name.`);
    if (m.kind === "crypto" && (!m.coin || !m.network || m.address.length < 20)) throw badRequest(`“${m.label}”: enter the coin, the network and the full wallet address.`);
  }
  if (new Set(input.methods.map((m) => m.id)).size !== input.methods.length) throw badRequest("Two methods have the same id.");
  return writeSetting(db, "manual_payments", input);
}

/** The code customers put in the transfer narration so you can match payments: AP-1A2B3C. */
export const payReference = (userId: string) => `AP-${userId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

async function cryptoRate(db: Db, cfg: ManualConfig) {
  return cfg.cryptoRateKobo > 0 ? cfg.cryptoRateKobo : await getUsdRateKobo(db);
}

/** What to send for `amountKobo` with this method: "₦50,000.00" or "31.26 USDT" / "$31.26 worth of BTC". */
function payAmountFor(m: Method, amountKobo: number, rateKobo: number) {
  if (m.kind === "bank") return `₦${(amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!(rateKobo > 0)) throw new AppError(503, "NO_RATE", "Crypto rates are being updated. Please try again in a few minutes.");
  const usd = Math.ceil((amountKobo / rateKobo) * 100) / 100;
  return STABLE.test(m.coin) ? `${usd.toFixed(2)} ${m.coin}` : `$${usd.toFixed(2)} worth of ${m.coin}`;
}

/* ---------- Customer ---------- */

export async function manualOverview(db: Db, userId: string) {
  const cfg = await getManualConfig(db);
  const rate = await cryptoRate(db, cfg);
  const methods = cfg.enabled ? cfg.methods.filter((m) => m.enabled) : [];
  const deposits = await db.select().from(manualDeposits).where(eq(manualDeposits.userId, userId)).orderBy(desc(manualDeposits.createdAt)).limit(10);
  return {
    enabled: cfg.enabled && methods.length > 0,
    reference: payReference(userId),
    minKobo: env().MIN_FUNDING_KOBO,
    maxKobo: MAX_KOBO,
    cryptoRateKobo: rate,
    methods: await Promise.all(methods.map(async (m) => ({
      id: m.id, kind: m.kind, label: m.label, note: m.note,
      ...(m.kind === "bank"
        ? { bankName: m.bankName, accountNumber: m.accountNumber, accountName: m.accountName }
        : { coin: m.coin, network: m.network, address: m.address, stable: STABLE.test(m.coin), qr: `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(m.address, { type: "svg", margin: 1 })).toString("base64")}` }),
    }))),
    deposits: deposits.map((d) => ({
      id: d.id, publicId: d.publicId, method: d.methodLabel, amountKobo: d.amountKobo, payAmount: d.payAmount, status: d.status,
      creditedKobo: d.creditedKobo, note: d.status === "rejected" ? d.adminNote : null, createdAt: d.createdAt,
    })),
  };
}

export const submitSchema = z.object({
  methodId: z.string().min(1).max(40),
  amount: z.coerce.number().positive("Enter an amount").max(MAX_KOBO / 100),
  proof: z.string().trim().min(3, "Enter the transaction ID (or the sender's name for a bank transfer)").max(200),
});

export async function submitManualDeposit(db: Db, user: { id: string; email: string; name: string }, input: z.output<typeof submitSchema>) {
  const cfg = await getManualConfig(db);
  const m = cfg.enabled ? cfg.methods.find((x) => x.id === input.methodId && x.enabled) : undefined;
  if (!m) throw badRequest("That payment method isn't available any more. Please refresh the page.");
  const amountKobo = Math.round(input.amount * 100);
  if (amountKobo < env().MIN_FUNDING_KOBO) throw badRequest(`The minimum top-up is ₦${(env().MIN_FUNDING_KOBO / 100).toLocaleString("en-NG")}.`);
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(manualDeposits).where(and(eq(manualDeposits.userId, user.id), eq(manualDeposits.status, "pending")));
  if (busy.n >= 3) throw badRequest("You already have 3 payments waiting to be confirmed. Please wait for those first.");
  const proof = input.proof.replace(/\s+/g, " ");
  if (m.kind === "crypto") {
    const [dup] = await db.select({ id: manualDeposits.id }).from(manualDeposits)
      .where(and(sql`lower(${manualDeposits.proof}) = ${proof.toLowerCase()}`, inArray(manualDeposits.status, ["pending", "confirmed"]))).limit(1);
    if (dup) throw badRequest("That transaction ID has already been submitted.");
  }
  const payAmount = payAmountFor(m, amountKobo, await cryptoRate(db, cfg));
  const [d] = await db.insert(manualDeposits).values({
    userId: user.id, methodId: m.id, methodLabel: m.label, kind: m.kind, amountKobo, payAmount, proof,
  }).returning();
  // Tell the admins (don't fail the customer's request if email has a hiccup).
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
  await sendNotice(
    [...admins.map((a) => a.email), ...cfg.notifyEmails],
    `Payment to check: ₦${(amountKobo / 100).toLocaleString("en-NG")} via ${m.label} (#P-${d.publicId})`,
    [
      `${user.name} (${user.email}) says they paid ${payAmount} via ${m.label}.`,
      m.kind === "crypto" ? `Transaction ID: ${proof}` : `Sender / reference: ${proof}. Their narration code is ${payReference(user.id)}.`,
      `Check that it arrived, then confirm to credit ₦${(amountKobo / 100).toLocaleString("en-NG")} to their wallet (or reject with a reason).`,
    ],
    { href: `${env().APP_URL.replace(/\/+$/, "")}/admin/payments`, label: "Open payments to check" },
  ).catch((e) => console.error("[manual] admin email", e));
  return { id: d.id, publicId: d.publicId, payAmount, status: d.status };
}

/* ---------- Admin ---------- */

export async function adminManualOverview(db: Db) {
  const cfg = await getManualConfig(db);
  const rows = await db.select({ d: manualDeposits, email: users.email, name: users.name, joined: users.createdAt })
    .from(manualDeposits).innerJoin(users, eq(users.id, manualDeposits.userId))
    .orderBy(sql`(${manualDeposits.status} = 'pending') desc`, desc(manualDeposits.createdAt)).limit(100);
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
  return {
    config: cfg,
    siteRateKobo: await getUsdRateKobo(db),
    adminEmails: admins.map((a) => a.email),
    emailOn: Boolean(env().RESEND_API_KEY),
    deposits: rows.map(({ d, email, name, joined }) => ({
      id: d.id, publicId: d.publicId, method: d.methodLabel, kind: d.kind, amountKobo: d.amountKobo, payAmount: d.payAmount, proof: d.proof,
      status: d.status, creditedKobo: d.creditedKobo, note: d.adminNote, createdAt: d.createdAt, decidedAt: d.decidedAt,
      customer: { name, email, reference: payReference(d.userId), newAccount: Date.now() - joined.getTime() < 3 * 86_400_000 },
    })),
  };
}

const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Confirm: credit the wallet (amount can be adjusted if they sent a different sum). */
export async function confirmManualDeposit(db: Db, adminId: string, id: string, creditKobo?: number) {
  const r = await db.transaction(async (tx) => {
    const [d] = await tx.select().from(manualDeposits).where(eq(manualDeposits.id, id)).for("update");
    if (!d) throw notFound("Payment");
    if (d.status !== "pending") throw badRequest("This payment has already been handled.");
    const amount = creditKobo ?? d.amountKobo;
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_KOBO) throw badRequest("Enter the amount to credit.");
    const walletId = await walletIdForUser(tx, d.userId);
    await creditWallet(tx, walletId, amount, "deposit", { refType: "manual_deposit", refId: d.id, memo: `Wallet top-up via ${d.methodLabel}`, idempotencyKey: `manual:${d.id}` });
    await tx.update(manualDeposits).set({ status: "confirmed", creditedKobo: amount, decidedBy: adminId, decidedAt: new Date() }).where(eq(manualDeposits.id, id));
    const [u] = await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, d.userId));
    return { d, amount, u };
  });
  await sendNotice([r.u.email], `${naira(r.amount)} added to your Almighty Pumps wallet`, [
    `Hi ${r.u.name.split(" ")[0]},`, `We received your payment via ${r.d.methodLabel} and added ${naira(r.amount)} to your wallet. Thank you!`,
  ], { href: `${env().APP_URL.replace(/\/+$/, "")}/dashboard#wallet`, label: "Open my wallet" }).catch(() => null);
  return { confirmed: r.d.publicId, creditedKobo: r.amount };
}

export async function rejectManualDeposit(db: Db, adminId: string, id: string, reason: string) {
  if (reason.trim().length < 3) throw badRequest("Tell the customer why (they see this).");
  const [d] = await db.update(manualDeposits).set({ status: "rejected", adminNote: reason.trim(), decidedBy: adminId, decidedAt: new Date() })
    .where(and(eq(manualDeposits.id, id), eq(manualDeposits.status, "pending"))).returning();
  if (!d) throw badRequest("This payment has already been handled.");
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, d.userId));
  await sendNotice([u.email], "About your Almighty Pumps payment", [
    `Hi ${u.name.split(" ")[0]},`, `We couldn't confirm your payment of ${d.payAmount} via ${d.methodLabel}.`, `Reason: ${reason.trim()}`,
    "If you think this is a mistake, reply to support@almightypumps.com with your payment receipt.",
  ]).catch(() => null);
  return { rejected: d.publicId };
}
