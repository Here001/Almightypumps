/**
 * Pure wallet arithmetic. The database layer locks a wallet row, runs one of
 * these functions on its current numbers, writes the result and a ledger entry
 * in the same transaction. Keeping the rules here makes them easy to test.
 *
 * available: money the user can spend or withdraw.
 * held:      money set aside for an order, escrow trade or withdrawal.
 */
import { assertKobo, assertPositiveKobo, type Kobo } from "./money.ts";

export type WalletState = { available: Kobo; held: Kobo };

export class LedgerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

function check(s: WalletState): WalletState {
  assertKobo(s.available, "available");
  assertKobo(s.held, "held");
  return s;
}

export function credit(s: WalletState, amount: Kobo): WalletState {
  assertPositiveKobo(amount);
  return check({ available: s.available + amount, held: s.held });
}

export function debit(s: WalletState, amount: Kobo): WalletState {
  assertPositiveKobo(amount);
  if (s.available < amount) {
    throw new LedgerError("INSUFFICIENT_FUNDS", "Your wallet balance is too low. Fund your wallet and try again.");
  }
  return check({ available: s.available - amount, held: s.held });
}

/** Move money from available into held. */
export function hold(s: WalletState, amount: Kobo): WalletState {
  assertPositiveKobo(amount);
  if (s.available < amount) {
    throw new LedgerError("INSUFFICIENT_FUNDS", "Your wallet balance is too low. Fund your wallet and try again.");
  }
  return check({ available: s.available - amount, held: s.held + amount });
}

/** Held money leaves the wallet (paid to the platform, a seller or a bank). */
export function capture(s: WalletState, amount: Kobo): WalletState {
  assertKobo(amount);
  if (s.held < amount) throw new LedgerError("HELD_TOO_LOW", "Held balance is lower than the amount to capture");
  return check({ available: s.available, held: s.held - amount });
}

/** Held money goes back to available. */
export function release(s: WalletState, amount: Kobo): WalletState {
  assertKobo(amount);
  if (s.held < amount) throw new LedgerError("HELD_TOO_LOW", "Held balance is lower than the amount to release");
  return check({ available: s.available + amount, held: s.held - amount });
}

export type HoldRecord = { amount: Kobo; settled: Kobo };

/**
 * Settle what is left of a hold: capture `captureAmount`, release the rest.
 * Returns the split. A hold can only be settled once in full.
 */
export function settleHold(h: HoldRecord, captureAmount: Kobo): { capture: Kobo; release: Kobo } {
  assertKobo(captureAmount);
  const remaining = h.amount - h.settled;
  if (remaining <= 0) throw new LedgerError("HOLD_CLOSED", "This hold has already been settled");
  if (captureAmount > remaining) throw new LedgerError("CAPTURE_TOO_HIGH", "Capture is larger than the money held");
  return { capture: captureAmount, release: remaining - captureAmount };
}
