/**
 * Wallet funding through Paystack, plus withdrawal requests.
 * Funding is only credited after we verify the transaction with Paystack's
 * API, and each payment reference can credit a wallet once.
 */
import { and, eq } from "drizzle-orm";
import { paymentReference, verifyPaystackSignature } from "@/core/crypto";
import type { Kobo } from "@/core/money";
import type { Db } from "./db";
import { payments, users, withdrawals } from "./db/schema";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { creditWallet, placeHold, settleHold, walletIdForUser } from "./wallet";

const PAYSTACK = "https://api.paystack.co";

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = env().PAYSTACK_SECRET_KEY;
  if (!secret) throw new AppError(500, "PAYSTACK_NOT_CONFIGURED", "Payments aren't set up yet. Add PAYSTACK_SECRET_KEY.");
  const res = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new AppError(502, "PAYSTACK_ERROR", `Paystack: ${json.message || res.statusText}`);
  return json.data;
}

export async function startFunding(db: Db, userId: string, amount: Kobo) {
  if (amount < env().MIN_FUNDING_KOBO) throw badRequest(`The minimum top-up is ₦${(env().MIN_FUNDING_KOBO / 100).toLocaleString("en-NG")}.`);
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const reference = paymentReference("fund");
  await db.insert(payments).values({ userId, reference, amount });
  const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: u.email,
      amount,
      reference,
      currency: "NGN",
      callback_url: `${env().APP_URL}/dashboard?ref=${reference}`,
      metadata: { userId, purpose: "wallet_funding" },
    }),
  });
  return { reference, authorizationUrl: data.authorization_url };
}

/** Verify with Paystack and credit the wallet once. Safe to call repeatedly. */
export async function confirmFunding(db: Db, reference: string) {
  const [p] = await db.select().from(payments).where(eq(payments.reference, reference));
  if (!p) throw notFound("Payment");
  if (p.status === "success") return { credited: false, status: p.status };

  const tx = await paystack<{ status: string; amount: number; currency: string; reference: string }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (tx.status !== "success") {
    if (tx.status === "failed" || tx.status === "abandoned") {
      await db.update(payments).set({ status: "failed", raw: tx }).where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
    }
    return { credited: false, status: tx.status };
  }
  if (tx.amount !== p.amount || tx.currency !== "NGN") {
    throw new AppError(409, "AMOUNT_MISMATCH", "The paid amount doesn't match this top-up. Contact support with your reference.");
  }

  return db.transaction(async (t) => {
    const [locked] = await t.select().from(payments).where(eq(payments.id, p.id)).for("update");
    if (locked.status === "success") return { credited: false, status: "success" };
    const walletId = await walletIdForUser(t, p.userId);
    await creditWallet(t, walletId, p.amount, "deposit", { refType: "payment", refId: p.reference, memo: "Wallet top-up via Paystack", idempotencyKey: `payment:${p.reference}` });
    await t.update(payments).set({ status: "success", paidAt: new Date(), raw: tx }).where(eq(payments.id, p.id));
    return { credited: true, status: "success" };
  });
}

export async function handlePaystackWebhook(db: Db, rawBody: string, signature: string | null) {
  if (!verifyPaystackSignature(rawBody, signature, env().PAYSTACK_SECRET_KEY)) {
    throw new AppError(401, "BAD_SIGNATURE", "Invalid signature");
  }
  const event = JSON.parse(rawBody) as { event: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference?.startsWith("AP-FUND-")) {
    return confirmFunding(db, event.data.reference);
  }
  return { ignored: event.event };
}

/* ---------------- Withdrawals (paid out manually by an admin for now) ---------------- */

export async function requestWithdrawal(
  db: Db,
  userId: string,
  input: { amount: Kobo; bankCode: string; accountNumber: string; accountName: string },
) {
  if (input.amount < env().MIN_WITHDRAWAL_KOBO) throw badRequest(`The minimum withdrawal is ₦${(env().MIN_WITHDRAWAL_KOBO / 100).toLocaleString("en-NG")}.`);
  if (!/^\d{10}$/.test(input.accountNumber)) throw badRequest("Account number must be 10 digits.");
  if (!/^\d{3,6}$/.test(input.bankCode)) throw badRequest("Choose your bank.");
  if (input.accountName.trim().length < 3) throw badRequest("Enter the account name.");
  return db.transaction(async (tx) => {
    const walletId = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, walletId, input.amount, "withdrawal", { memo: "Withdrawal request" });
    const [w] = await tx
      .insert(withdrawals)
      .values({ userId, amount: input.amount, holdId, bankCode: input.bankCode, accountNumber: input.accountNumber, accountName: input.accountName.trim() })
      .returning();
    return w;
  });
}

export async function decideWithdrawal(db: Db, withdrawalId: string, decision: "paid" | "rejected", note?: string) {
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for("update");
    if (!w) throw notFound("Withdrawal");
    if (w.status !== "requested") throw badRequest("This withdrawal has already been decided.");
    await settleHold(tx, w.holdId, decision === "paid" ? w.amount : 0, [], { refType: "withdrawal", refId: w.id, idempotencyKey: `withdrawal:${w.id}` });
    const [u] = await tx.update(withdrawals).set({ status: decision, note, decidedAt: new Date() }).where(eq(withdrawals.id, w.id)).returning();
    return u;
  });
}
