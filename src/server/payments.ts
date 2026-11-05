/**
 * Wallet funding through Flutterwave (v3 Standard checkout), plus withdrawal requests.
 * Funding is only credited after we verify the transaction with Flutterwave's
 * API, and each payment reference can credit a wallet once.
 */
import { alertAdmins } from "./adminAlerts";
import { and, desc, eq, sql } from "drizzle-orm";
import { NG_BANKS } from "@/core/banks";
import { paymentReference, verifyFlutterwaveWebhook } from "@/core/crypto";
import type { Kobo } from "@/core/money";
import type { Db } from "./db";
import { payments, sellerProfiles, users, wallets, withdrawals } from "./db/schema";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { creditWallet, placeHold, settleHold, walletIdForUser } from "./wallet";
import { handleTransferWebhook } from "./bankTransfer";
import { alertCustomer, alertNaira } from "./customerAlerts";

/** Call Flutterwave's v3 API (also used by bankTransfer.ts). */
export async function flutterwave<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = env().FLUTTERWAVE_SECRET_KEY;
  if (!secret) throw new AppError(500, "PAYMENTS_NOT_CONFIGURED", "Payments aren't set up yet. Add FLUTTERWAVE_SECRET_KEY.");
  const res = await fetch(`${env().FLUTTERWAVE_BASE_URL.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: T };
  if (!res.ok || json.status !== "success" || json.data === undefined) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", `Flutterwave: ${json.message || res.statusText}`);
  }
  return json.data;
}

export async function startFunding(db: Db, userId: string, amount: Kobo) {
  if (amount < env().MIN_FUNDING_KOBO) throw badRequest(`The minimum top-up is ₦${(env().MIN_FUNDING_KOBO / 100).toLocaleString("en-NG")}.`);
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const reference = paymentReference("fund");
  await db.insert(payments).values({ userId, reference, amount, provider: "flutterwave" });
  const data = await flutterwave<{ link: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: reference,
      amount: amount / 100, // Flutterwave takes naira, we store kobo
      currency: "NGN",
      redirect_url: `${env().APP_URL}/dashboard`,
      customer: { email: u.email, name: u.name },
      customizations: { title: "Almighty Pumps wallet top-up" },
      meta: { userId, purpose: "wallet_funding" },
    }),
  });
  return { reference, authorizationUrl: data.link };
}

type FlwTransaction = { id: number; tx_ref: string; status: string; amount: number; currency: string };

/** Verify with Flutterwave and credit the wallet once. Safe to call repeatedly. */
export async function confirmFunding(db: Db, reference: string) {
  const [p] = await db.select().from(payments).where(eq(payments.reference, reference));
  if (!p) throw notFound("Payment");
  if (p.status === "success") return { credited: false, status: p.status };

  let tx: FlwTransaction;
  try {
    tx = await flutterwave<FlwTransaction>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
  } catch (e) {
    // No transaction yet (checkout opened but not paid): report pending rather than an error.
    if (e instanceof AppError && /no transaction/i.test(e.message)) return { credited: false, status: "pending" };
    throw e;
  }
  if (tx.tx_ref !== reference) throw new AppError(409, "REFERENCE_MISMATCH", "Payment reference mismatch. Contact support with your reference.");
  if (tx.status !== "successful") {
    if (tx.status === "failed") {
      await db.update(payments).set({ status: "failed", raw: tx }).where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
    }
    return { credited: false, status: tx.status };
  }
  if (Math.round(tx.amount * 100) !== p.amount || tx.currency !== "NGN") {
    throw new AppError(409, "AMOUNT_MISMATCH", "The paid amount doesn't match this top-up. Contact support with your reference.");
  }

  return db.transaction(async (t) => {
    const [locked] = await t.select().from(payments).where(eq(payments.id, p.id)).for("update");
    if (locked.status === "success") return { credited: false, status: "success" };
    const walletId = await walletIdForUser(t, p.userId);
    await creditWallet(t, walletId, p.amount, "deposit", { refType: "payment", refId: p.reference, memo: "Wallet top-up via Flutterwave", idempotencyKey: `payment:${p.reference}` });
    await t.update(payments).set({ status: "success", paidAt: new Date(), raw: tx }).where(eq(payments.id, p.id));
    return { credited: true, status: "success" };
  });
}

/** Webhook payloads are never trusted for amounts: we only use the reference, then re-verify via the API. */
export async function handleFlutterwaveWebhook(
  db: Db,
  rawBody: string,
  headers: { verifHash: string | null; signature: string | null },
) {
  if (!verifyFlutterwaveWebhook(rawBody, headers, env().FLUTTERWAVE_WEBHOOK_HASH)) {
    console.warn("[webhook] flutterwave: rejected (signature/secret hash mismatch)");
    throw new AppError(401, "BAD_SIGNATURE", "Invalid signature");
  }
  const event = JSON.parse(rawBody) as { event?: string; data?: { id?: number; tx_ref?: string; txRef?: string } };
  const ref = event.data?.tx_ref ?? event.data?.txRef;
  // Transfers into a customer's bank-transfer account number (one-time or permanent).
  if (ref?.startsWith("AP-VA-") || ref?.startsWith("AP-VAP-")) {
    const result = await handleTransferWebhook(db, event.data ?? {});
    console.info(`[webhook] flutterwave ${event.event ?? "?"} ${ref}: ${"credited" in result && result.credited ? "credited (bank transfer)" : `no change (${JSON.stringify(result)})`}`);
    return result;
  }
  if (ref?.startsWith("AP-FUND-")) {
    const [known] = await db.select({ id: payments.id }).from(payments).where(eq(payments.reference, ref));
    if (!known) {
      console.info(`[webhook] flutterwave ${event.event ?? "?"} ${ref}: unknown reference, ignored`);
      return { ignored: "unknown reference" };
    }
    const result = await confirmFunding(db, ref);
    // Diagnostics only (no amounts or secrets): shows the webhook arrived and whether it credited.
    console.info(`[webhook] flutterwave ${event.event ?? "?"} ${ref}: ${result.credited ? "credited" : `no change (${result.status})`}`);
    return result;
  }
  console.info(`[webhook] flutterwave ${event.event ?? "?"}: ignored`);
  return { ignored: event.event ?? "unknown" };
}

/* ---------------- Withdrawals (paid out manually by an admin for now) ---------------- */

export async function requestWithdrawal(
  db: Db,
  userId: string,
  input: { amount: Kobo; bankCode: string; accountNumber: string; accountName: string },
) {
  if (input.amount < env().MIN_WITHDRAWAL_KOBO) throw badRequest(`The minimum withdrawal is ₦${(env().MIN_WITHDRAWAL_KOBO / 100).toLocaleString("en-NG")}.`);
  if (!/^\d{10}$/.test(input.accountNumber)) throw badRequest("Account number must be 10 digits.");
  if (!NG_BANKS.some((b) => b.code === input.bankCode)) throw badRequest("Choose your bank.");
  if (input.accountName.trim().length < 3) throw badRequest("Enter the account name.");
  const w = await db.transaction(async (tx) => {
    const walletId = await walletIdForUser(tx, userId);
    const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(withdrawals).where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, "requested")));
    if (open.n >= 3) throw badRequest("You already have 3 withdrawals waiting. Please wait for those to be paid.");
    const [bal] = await tx.select({ available: wallets.available }).from(wallets).where(eq(wallets.id, walletId));
    if (!bal || bal.available < input.amount) {
      throw badRequest(`You can withdraw up to ₦${((bal?.available ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`);
    }
    const holdId = await placeHold(tx, walletId, input.amount, "withdrawal", { memo: "Withdrawal request" });
    const [w] = await tx
      .insert(withdrawals)
      .values({ userId, amount: input.amount, holdId, bankCode: input.bankCode, accountNumber: input.accountNumber, accountName: input.accountName.trim() })
      .returning();
    return w;
  });
  alertAdmins(db, `Withdrawal to pay: ${"₦" + (input.amount / 100).toLocaleString("en-NG")}`, [
    "A customer asked to withdraw money to their bank account.",
    `Pay to: ${input.accountName.trim()} · ${NG_BANKS.find((b) => b.code === input.bankCode)?.name ?? input.bankCode} · ${input.accountNumber}`,
    "Send the transfer, then tap “Mark paid” (or reject it with a reason).",
  ], "/admin/withdrawals", { customerId: userId });
  return w;
}

export async function decideWithdrawal(db: Db, withdrawalId: string, decision: "paid" | "rejected", note?: string) {
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for("update");
    if (!w) throw notFound("Withdrawal");
    if (w.status !== "requested") throw badRequest("This withdrawal has already been decided.");
    await settleHold(tx, w.holdId, decision === "paid" ? w.amount : 0, [], { refType: "withdrawal", refId: w.id, idempotencyKey: `withdrawal:${w.id}` });
    const [u] = await tx.update(withdrawals).set({ status: decision, note, decidedAt: new Date() }).where(eq(withdrawals.id, w.id)).returning();
    if (decision === "paid") alertCustomer(db, w.userId, `Withdrawal of ${alertNaira(w.amount)} sent`, [`We've sent ${alertNaira(w.amount)} to your bank account. Bank transfers usually arrive within minutes, sometimes a few hours.`], "wallet");
    else alertCustomer(db, w.userId, `Withdrawal not sent`, [`Your withdrawal of ${alertNaira(w.amount)} wasn't sent, and the money is back in your wallet.${note?.trim() ? ` Reason: ${note.trim()}` : ""}`], "wallet");
    return u;
  });
}

/** The customer's withdrawals, plus bank details to pre-fill (their seller payout account, or the last one used). */
export async function myWithdrawals(db: Db, userId: string) {
  const list = await db.select({
    id: withdrawals.id, amount: withdrawals.amount, status: withdrawals.status, note: withdrawals.note,
    bankCode: withdrawals.bankCode, accountNumber: withdrawals.accountNumber, accountName: withdrawals.accountName,
    createdAt: withdrawals.createdAt, decidedAt: withdrawals.decidedAt,
  }).from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt)).limit(20);
  const [sp] = await db.select({ bankCode: sellerProfiles.bankCode, accountNumber: sellerProfiles.accountNumber, accountName: sellerProfiles.accountName })
    .from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  const last = list[0];
  const bank = sp ?? (last ? { bankCode: last.bankCode, accountNumber: last.accountNumber, accountName: last.accountName } : null);
  const name = (code: string) => NG_BANKS.find((b) => b.code === code)?.name ?? code;
  return {
    minKobo: env().MIN_WITHDRAWAL_KOBO,
    bank,
    withdrawals: list.map((w) => ({ ...w, bankName: name(w.bankCode) })),
  };
}
