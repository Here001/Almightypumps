/**
 * Wallet operations. Every function takes a transaction handle and locks the
 * wallet rows it touches (SELECT ... FOR UPDATE) so concurrent requests can't
 * double-spend. Wallets are always locked in id order to avoid deadlocks.
 */
import { and, eq, inArray } from "drizzle-orm";
import * as L from "@/core/ledger";
import type { Kobo } from "@/core/money";
import type { DbOrTx, Tx } from "./db";
import { holds, ledgerEntries, users, wallets } from "./db/schema";
import { AppError, notFound } from "./errors";

type WalletRow = typeof wallets.$inferSelect;
type Ref = { refType?: string; refId?: string; memo?: string; idempotencyKey?: string };

export async function lockWallets(tx: Tx, ids: string[]): Promise<Map<string, WalletRow>> {
  const unique = [...new Set(ids)].sort();
  const rows = await tx.select().from(wallets).where(inArray(wallets.id, unique)).orderBy(wallets.id).for("update");
  if (rows.length !== unique.length) throw notFound("Wallet");
  return new Map(rows.map((r) => [r.id, r]));
}

export async function walletIdForUser(tx: DbOrTx, userId: string): Promise<string> {
  const [w] = await tx.select({ id: wallets.id }).from(wallets).where(eq(wallets.userId, userId));
  if (!w) throw notFound("Wallet");
  return w.id;
}

export async function platformWalletId(tx: DbOrTx): Promise<string> {
  const [w] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(users.isSystem, true))
    .limit(1);
  if (!w) throw new AppError(500, "NO_PLATFORM_WALLET", "Platform wallet is missing. Run the database migration.");
  return w.id;
}

async function write(tx: Tx, before: WalletRow, after: L.WalletState, kind: string, ref: Ref) {
  await tx.update(wallets).set({ available: after.available, held: after.held, updatedAt: new Date() }).where(eq(wallets.id, before.id));
  await tx.insert(ledgerEntries).values({
    walletId: before.id,
    kind,
    availableChange: after.available - before.available,
    heldChange: after.held - before.held,
    availableAfter: after.available,
    heldAfter: after.held,
    refType: ref.refType,
    refId: ref.refId,
    memo: ref.memo,
    idempotencyKey: ref.idempotencyKey,
  });
  before.available = after.available;
  before.held = after.held;
}

/** Add money to a wallet. With an idempotency key, a repeat call does nothing. */
export async function creditWallet(tx: Tx, walletId: string, amount: Kobo, kind: string, ref: Ref = {}): Promise<boolean> {
  if (ref.idempotencyKey) {
    const [seen] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, ref.idempotencyKey));
    if (seen) return false;
  }
  const w = (await lockWallets(tx, [walletId])).get(walletId)!;
  await write(tx, w, L.credit(w, amount), kind, ref);
  return true;
}

/** Take money out of a wallet's available balance (admin adjustments). Fails if the balance is too low. */
export async function debitWallet(tx: Tx, walletId: string, amount: Kobo, kind: string, ref: Ref = {}): Promise<boolean> {
  if (ref.idempotencyKey) {
    const [seen] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, ref.idempotencyKey));
    if (seen) return false;
  }
  const w = (await lockWallets(tx, [walletId])).get(walletId)!;
  await write(tx, w, L.debit(w, amount), kind, ref);
  return true;
}

/** Set money aside. Returns the hold id. */
export async function placeHold(
  tx: Tx,
  walletId: string,
  amount: Kobo,
  purpose: "smm_order" | "escrow" | "withdrawal" | "shop_order" | "sms_verify" | "esim_order" | "gift_card" | "airtime" | "travel_esim" | "shipping",
  ref: Ref = {},
): Promise<string> {
  const w = (await lockWallets(tx, [walletId])).get(walletId)!;
  const [h] = await tx.insert(holds).values({ walletId, amount, purpose }).returning({ id: holds.id });
  await write(tx, w, L.hold(w, amount), `hold:${purpose}`, { ...ref, refType: ref.refType ?? "hold", refId: ref.refId ?? h.id });
  return h.id;
}

export async function linkHold(tx: Tx, holdId: string, refId: string) {
  await tx.update(holds).set({ refId }).where(eq(holds.id, holdId));
}

/**
 * Settle a hold: capture part (or all) of it and release the rest to the owner.
 * `payTo` credits the captured money to other wallets; the amounts must add up
 * to the capture. Leave it empty when money leaves the platform (withdrawal).
 */
export async function settleHold(
  tx: Tx,
  holdId: string,
  captureAmount: Kobo,
  payTo: { walletId: string; amount: Kobo; kind: string }[],
  ref: Ref = {},
): Promise<{ captured: Kobo; released: Kobo }> {
  const [h] = await tx.select().from(holds).where(eq(holds.id, holdId)).for("update");
  if (!h) throw notFound("Hold");
  const split = L.settleHold(h, captureAmount);
  const payTotal = payTo.reduce((s, p) => s + p.amount, 0);
  if (payTo.length > 0 && payTotal !== split.capture) {
    throw new AppError(500, "PAYOUT_MISMATCH", "Payout amounts do not match the captured amount.");
  }

  const locked = await lockWallets(tx, [h.walletId, ...payTo.map((p) => p.walletId)]);
  const owner = locked.get(h.walletId)!;

  // Each ledger line gets its own idempotency key derived from the caller's.
  const keyed = (suffix: string): Ref => ({ ...ref, idempotencyKey: ref.idempotencyKey ? `${ref.idempotencyKey}:${suffix}` : undefined });
  if (split.capture > 0) await write(tx, owner, L.capture(owner, split.capture), `capture:${h.purpose}`, keyed("capture"));
  if (split.release > 0) await write(tx, owner, L.release(owner, split.release), `release:${h.purpose}`, keyed("release"));
  for (const p of payTo) {
    if (p.amount === 0) continue;
    const w = locked.get(p.walletId)!;
    await write(tx, w, L.credit(w, p.amount), p.kind, keyed(`credit:${p.walletId}:${p.kind}`));
  }

  const status = split.capture === 0 ? "released" : split.release === 0 ? "captured" : "partial";
  await tx
    .update(holds)
    .set({ settled: h.amount, status, closedAt: new Date() })
    .where(and(eq(holds.id, holdId), eq(holds.status, "active")));
  return { captured: split.capture, released: split.release };
}
