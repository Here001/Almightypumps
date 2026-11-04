/**
 * Automatic bank-transfer top-ups with Flutterwave virtual account numbers.
 *
 * - One-time account (no BVN): the customer picks an amount and gets an account number valid for a short time.
 * - Permanent account (BVN once): the customer's own account number; any transfer to it tops up their wallet.
 *   The BVN is sent to Flutterwave and never stored here.
 *
 * Money is credited only after we re-verify the transaction with Flutterwave's API (webhook amounts are never
 * trusted), once per Flutterwave transaction id (idempotency key `flwtx:<id>`). The sync-orders cron and the
 * customer's "I've sent it" button also look transfers up, in case a webhook is missed.
 */
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { paymentReference } from "@/core/crypto";
import type { Db } from "./db";
import { payments, users, virtualAccounts } from "./db/schema";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { flutterwave } from "./payments";
import { creditWallet, walletIdForUser } from "./wallet";
import { readSetting, writeSetting } from "./appSettings";

export type BankTransferConfig = { enabled: boolean; permanent: boolean };
const DEFAULTS: BankTransferConfig = { enabled: false, permanent: true };
export const getBankTransferConfig = (db: Db) => readSetting(db, "bank_transfer", DEFAULTS);
export const saveBankTransferConfig = (db: Db, cfg: BankTransferConfig) => writeSetting(db, "bank_transfer", { enabled: !!cfg.enabled, permanent: !!cfg.permanent });

const ONETIME_MAX_KOBO = 5_000_000_00; // ₦5m
type FlwAccount = { account_number: string; bank_name: string; flw_ref?: string; order_ref?: string; expiry_date?: string; note?: string; amount?: string | number };
type FlwTx = { id: number; tx_ref: string; flw_ref?: string; amount: number; currency: string; status: string; payment_type?: string; created_at?: string };

/** Flutterwave's note reads "Please make a bank transfer to <name>": keep just the name. */
const nameFromNote = (note?: string) => (note ? note.replace(/^.*?transfer to\s*/i, "").trim().slice(0, 80) || null : null);

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "Customer", last: parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "Customer" };
};

function view(a: typeof virtualAccounts.$inferSelect) {
  return {
    id: a.id, kind: a.kind, accountNumber: a.accountNumber, bankName: a.bankName, accountName: a.accountName,
    amountKobo: a.amountKobo, expiresAt: a.expiresAt, status: a.status, createdAt: a.createdAt,
  };
}

/** What the customer's "Bank transfer (automatic)" card shows. */
export async function myBankTransfer(db: Db, userId: string) {
  const cfg = await getBankTransferConfig(db);
  const rows = await db.select().from(virtualAccounts).where(eq(virtualAccounts.userId, userId)).orderBy(desc(virtualAccounts.createdAt)).limit(10);
  const permanent = rows.find((r) => r.kind === "permanent");
  const onetime = rows.find((r) => r.kind === "onetime" && r.status === "active" && r.expiresAt && r.expiresAt.getTime() > Date.now());
  return {
    enabled: cfg.enabled && !!env().FLUTTERWAVE_SECRET_KEY,
    permanentAllowed: cfg.permanent,
    minKobo: env().MIN_FUNDING_KOBO,
    permanent: permanent ? view(permanent) : null,
    onetime: onetime ? view(onetime) : null,
  };
}

async function assertOn(db: Db) {
  const cfg = await getBankTransferConfig(db);
  if (!cfg.enabled || !env().FLUTTERWAVE_SECRET_KEY) throw badRequest("Automatic bank transfer isn't available right now. Use another top-up method.");
  return cfg;
}

/** A temporary account number for one exact amount. Reuses the customer's current one if it's for the same amount. */
export async function createOnetimeAccount(db: Db, userId: string, amountKobo: number) {
  await assertOn(db);
  if (!Number.isInteger(amountKobo) || amountKobo < env().MIN_FUNDING_KOBO) throw badRequest(`The minimum top-up is ₦${(env().MIN_FUNDING_KOBO / 100).toLocaleString("en-NG")}.`);
  if (amountKobo > ONETIME_MAX_KOBO) throw badRequest("That's above the limit for one transfer. Use a smaller amount.");
  if (amountKobo % 100 !== 0) throw badRequest("Use a whole Naira amount (no kobo).");
  const [existing] = await db.select().from(virtualAccounts)
    .where(and(eq(virtualAccounts.userId, userId), eq(virtualAccounts.kind, "onetime"), eq(virtualAccounts.status, "active"), gt(virtualAccounts.expiresAt, new Date(Date.now() + 10 * 60_000))))
    .orderBy(desc(virtualAccounts.createdAt)).limit(1);
  if (existing && existing.amountKobo === amountKobo) return view(existing);

  const [u] = await db.select({ email: users.email, name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const txRef = paymentReference("va");
  const { first, last } = splitName(u.name);
  const acct = await flutterwave<FlwAccount>("/virtual-account-numbers", {
    method: "POST",
    body: JSON.stringify({
      email: u.email, tx_ref: txRef, is_permanent: false, amount: amountKobo / 100, currency: "NGN",
      firstname: first, lastname: last, phonenumber: u.phone ?? undefined, narration: `Almighty Pumps ${first}`.slice(0, 60),
    }),
  });
  const expires = acct.expiry_date ? new Date(acct.expiry_date) : new Date(Date.now() + 60 * 60_000);
  const [row] = await db.insert(virtualAccounts).values({
    userId, kind: "onetime", txRef, accountNumber: acct.account_number, bankName: acct.bank_name, accountName: nameFromNote(acct.note),
    amountKobo, expiresAt: Number.isNaN(expires.getTime()) ? new Date(Date.now() + 60 * 60_000) : expires,
    flwRef: acct.flw_ref ?? null, orderRef: acct.order_ref ?? null,
  }).returning();
  // Older one-time accounts are replaced by this one.
  if (existing) await db.update(virtualAccounts).set({ status: "expired" }).where(eq(virtualAccounts.id, existing.id));
  return view(row);
}

export const bvnSchema = z.string().trim().regex(/^\d{11}$/, "Your BVN is 11 digits. Dial *565*0# to get it.");

/** The customer's own permanent account number (BVN needed once; not stored). */
export async function createPermanentAccount(db: Db, userId: string, bvn: string) {
  const cfg = await assertOn(db);
  if (!cfg.permanent) throw badRequest("Personal account numbers aren't available right now. Use a one-time account instead.");
  const [mine] = await db.select().from(virtualAccounts).where(and(eq(virtualAccounts.userId, userId), eq(virtualAccounts.kind, "permanent")));
  if (mine) return view(mine);
  const [u] = await db.select({ email: users.email, name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const txRef = paymentReference("vap");
  const { first, last } = splitName(u.name);
  let acct: FlwAccount;
  try {
    acct = await flutterwave<FlwAccount>("/virtual-account-numbers", {
      method: "POST",
      body: JSON.stringify({
        email: u.email, tx_ref: txRef, is_permanent: true, bvn: bvnSchema.parse(bvn), currency: "NGN",
        firstname: first, lastname: last, phonenumber: u.phone ?? undefined, narration: `${first} ${last} Almighty Pumps`.slice(0, 60),
      }),
    });
  } catch (e) {
    if (e instanceof AppError && /bvn/i.test(e.message)) throw badRequest("We couldn't confirm that BVN. Check the number, and that the name on your account matches your bank records.");
    throw e;
  }
  const [row] = await db.insert(virtualAccounts).values({
    userId, kind: "permanent", txRef, accountNumber: acct.account_number, bankName: acct.bank_name, accountName: nameFromNote(acct.note),
    flwRef: acct.flw_ref ?? null, orderRef: acct.order_ref ?? null,
  }).onConflictDoNothing().returning();
  if (!row) { const [again] = await db.select().from(virtualAccounts).where(and(eq(virtualAccounts.userId, userId), eq(virtualAccounts.kind, "permanent"))); return view(again); }
  return view(row);
}

/** Credit one verified Flutterwave transaction to the owner of the account it was paid into. Idempotent. */
async function creditTransfer(db: Db, account: typeof virtualAccounts.$inferSelect, tx: FlwTx) {
  if (tx.status !== "successful" || tx.currency !== "NGN" || tx.tx_ref !== account.txRef) return { credited: false, status: tx.status };
  const amount = Math.round(Number(tx.amount) * 100);
  if (!Number.isInteger(amount) || amount <= 0) return { credited: false, status: "bad amount" };
  const reference = `AP-VATX-${tx.id}`;
  return db.transaction(async (t) => {
    const [seen] = await t.select({ id: payments.id }).from(payments).where(eq(payments.reference, reference));
    if (seen) return { credited: false, status: "already credited" };
    await t.insert(payments).values({ userId: account.userId, reference, amount, status: "success", provider: "flutterwave_transfer", raw: tx, paidAt: new Date() });
    const ok = await creditWallet(t, await walletIdForUser(t, account.userId), amount, "deposit", {
      refType: "payment", refId: reference, memo: `Bank transfer top-up (${account.bankName} ${account.accountNumber})`, idempotencyKey: `flwtx:${tx.id}`,
    });
    if (account.kind === "onetime") await t.update(virtualAccounts).set({ status: "paid" }).where(eq(virtualAccounts.id, account.id));
    return { credited: ok, status: "success" };
  });
}

/** Webhook: a charge on one of our virtual accounts. Re-verifies by transaction id before crediting. */
export async function handleTransferWebhook(db: Db, data: { id?: number; tx_ref?: string; txRef?: string }) {
  const ref = data.tx_ref ?? data.txRef ?? "";
  const [account] = await db.select().from(virtualAccounts).where(eq(virtualAccounts.txRef, ref));
  if (!account) return { ignored: "unknown account" };
  if (!data.id) return { ignored: "no transaction id" };
  const tx = await flutterwave<FlwTx>(`/transactions/${encodeURIComponent(String(data.id))}/verify`);
  return creditTransfer(db, account, tx);
}

/** Look up transfers into an account (missed webhooks, "I've sent it" button). */
async function checkAccount(db: Db, account: typeof virtualAccounts.$inferSelect) {
  const list = await flutterwave<FlwTx[]>(`/transactions?tx_ref=${encodeURIComponent(account.txRef)}&status=successful`);
  let credited = 0;
  for (const t of Array.isArray(list) ? list : []) {
    if (t.tx_ref !== account.txRef) continue;
    // Re-verify each one individually before trusting it.
    const tx = await flutterwave<FlwTx>(`/transactions/${t.id}/verify`);
    const r = await creditTransfer(db, account, tx);
    if (r.credited) credited++;
  }
  return credited;
}

/** Customer: "I've sent it". Checks their accounts now. */
export async function checkMyTransfers(db: Db, userId: string) {
  await assertOn(db);
  const rows = await db.select().from(virtualAccounts)
    .where(and(eq(virtualAccounts.userId, userId), sql`(${virtualAccounts.kind} = 'permanent' OR (${virtualAccounts.status} = 'active' AND ${virtualAccounts.createdAt} > now() - interval '1 day'))`));
  let credited = 0;
  for (const r of rows) credited += await checkAccount(db, r).catch((e) => { console.error("[banktransfer] check", e); return 0; });
  return { credited };
}

/** Cron: check recent one-time accounts and expire old ones. */
export async function sweepTransfers(db: Db) {
  const cfg = await getBankTransferConfig(db);
  if (!cfg.enabled || !env().FLUTTERWAVE_SECRET_KEY) return { checked: 0 };
  const due = await db.select().from(virtualAccounts)
    .where(and(eq(virtualAccounts.kind, "onetime"), eq(virtualAccounts.status, "active"), gt(virtualAccounts.createdAt, new Date(Date.now() - 3 * 3600_000))))
    .limit(50);
  for (const a of due) await checkAccount(db, a).catch((e) => console.error("[banktransfer] sweep", e));
  // Accounts past their expiry by more than 2 hours can't receive money any more.
  await db.update(virtualAccounts).set({ status: "expired" })
    .where(and(eq(virtualAccounts.kind, "onetime"), eq(virtualAccounts.status, "active"), lt(virtualAccounts.expiresAt, new Date(Date.now() - 2 * 3600_000))));
  return { checked: due.length };
}

/** Admin: settings + recent automatic transfers. */
export async function bankTransferOverview(db: Db) {
  const config = await getBankTransferConfig(db);
  const recent = await db.select({ reference: payments.reference, amount: payments.amount, paidAt: payments.paidAt, name: users.name, email: users.email })
    .from(payments).innerJoin(users, eq(users.id, payments.userId))
    .where(inArray(payments.provider, ["flutterwave_transfer"])).orderBy(desc(payments.paidAt)).limit(30);
  const [counts] = await db.select({ permanent: sql<number>`count(*) filter (where ${virtualAccounts.kind} = 'permanent')::int` }).from(virtualAccounts);
  return { config, keySet: !!env().FLUTTERWAVE_SECRET_KEY, permanentAccounts: counts.permanent, recent };
}
