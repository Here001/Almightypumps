/**
 * P2P escrow state machine (pure).
 *
 *   PAID ──SHIP──▶ SHIPPED ──CONFIRM / AUTO_RELEASE──▶ COMPLETED   (seller paid)
 *    │               │
 *    │CANCEL         │DISPUTE
 *    │AUTO_CANCEL    ▼
 *    ▼            DISPUTED ──RESOLVE_SELLER──▶ COMPLETED
 *  CANCELLED                └─RESOLVE_BUYER──▶ REFUNDED  (buyer refunded)
 *  (buyer refunded)
 *
 * The buyer's money sits in a wallet hold from the moment the trade is created.
 */
import { feeBps, type Kobo } from "./money.ts";

export type TradeStatus = "PAID" | "SHIPPED" | "DISPUTED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
export type TradeAction =
  | "SHIP"
  | "CONFIRM"
  | "DISPUTE"
  | "CANCEL"
  | "AUTO_RELEASE"
  | "AUTO_CANCEL"
  | "RESOLVE_SELLER"
  | "RESOLVE_BUYER";
export type ActorRole = "buyer" | "seller" | "admin" | "system";
export type Effect = "NONE" | "PAYOUT_SELLER" | "REFUND_BUYER";

export const ESCROW_DEFAULTS = {
  shipWindowHours: 72,
  inspectionHours: 48,
  sellerFeeBps: 300, // 3% charged to the seller on payout
};

export type TradeSnapshot = {
  status: TradeStatus;
  shipBy: Date;
  inspectionEndsAt: Date | null;
};

export type TransitionResult = {
  status: TradeStatus;
  effect: Effect;
  patch: { shippedAt?: Date; inspectionEndsAt?: Date; closedAt?: Date };
};

export class EscrowError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EscrowError";
    this.code = code;
  }
}

export const TERMINAL: ReadonlySet<TradeStatus> = new Set(["COMPLETED", "CANCELLED", "REFUNDED"]);

const HOUR = 3_600_000;

function deny(message: string): never {
  throw new EscrowError("NOT_ALLOWED", message);
}

export function transition(
  trade: TradeSnapshot,
  action: TradeAction,
  actor: ActorRole,
  now: Date,
  config = ESCROW_DEFAULTS,
): TransitionResult {
  if (TERMINAL.has(trade.status)) deny("This trade is already closed.");
  const s = trade.status;

  switch (action) {
    case "SHIP":
      if (actor !== "seller") deny("Only the seller can mark an item as delivered.");
      if (s !== "PAID") deny("This trade can't be marked as delivered now.");
      return {
        status: "SHIPPED",
        effect: "NONE",
        patch: { shippedAt: now, inspectionEndsAt: new Date(now.getTime() + config.inspectionHours * HOUR) },
      };

    case "CONFIRM":
      if (actor !== "buyer") deny("Only the buyer can confirm the item is authentic.");
      if (s !== "SHIPPED") deny("You can confirm once the seller has marked the item as delivered.");
      return { status: "COMPLETED", effect: "PAYOUT_SELLER", patch: { closedAt: now } };

    case "DISPUTE":
      if (actor !== "buyer") deny("Only the buyer can open a dispute.");
      if (s !== "PAID" && s !== "SHIPPED") deny("This trade can't be disputed now.");
      if (s === "SHIPPED" && trade.inspectionEndsAt && now > trade.inspectionEndsAt) {
        deny("The inspection period has ended.");
      }
      return { status: "DISPUTED", effect: "NONE", patch: {} };

    case "CANCEL":
      if (s !== "PAID") deny("Only trades that haven't been delivered can be cancelled.");
      if (actor === "seller" || actor === "admin") {
        return { status: "CANCELLED", effect: "REFUND_BUYER", patch: { closedAt: now } };
      }
      if (actor === "buyer" && now > trade.shipBy) {
        return { status: "CANCELLED", effect: "REFUND_BUYER", patch: { closedAt: now } };
      }
      return deny("You can cancel once the seller misses the delivery deadline.");

    case "AUTO_RELEASE":
      if (actor !== "system") deny("Automatic release is run by the system.");
      if (s !== "SHIPPED") deny("Only delivered trades auto-release.");
      if (!trade.inspectionEndsAt || now < trade.inspectionEndsAt) deny("The inspection period is still running.");
      return { status: "COMPLETED", effect: "PAYOUT_SELLER", patch: { closedAt: now } };

    case "AUTO_CANCEL":
      if (actor !== "system") deny("Automatic cancellation is run by the system.");
      if (s !== "PAID") deny("Only undelivered trades auto-cancel.");
      if (now < trade.shipBy) deny("The seller still has time to deliver.");
      return { status: "CANCELLED", effect: "REFUND_BUYER", patch: { closedAt: now } };

    case "RESOLVE_SELLER":
      if (actor !== "admin") deny("Only the dispute team can resolve disputes.");
      if (s !== "DISPUTED") deny("This trade is not in dispute.");
      return { status: "COMPLETED", effect: "PAYOUT_SELLER", patch: { closedAt: now } };

    case "RESOLVE_BUYER":
      if (actor !== "admin") deny("Only the dispute team can resolve disputes.");
      if (s !== "DISPUTED") deny("This trade is not in dispute.");
      return { status: "REFUNDED", effect: "REFUND_BUYER", patch: { closedAt: now } };

    default:
      return deny("Unknown action.");
  }
}

export function shipDeadline(createdAt: Date, config = ESCROW_DEFAULTS): Date {
  return new Date(createdAt.getTime() + config.shipWindowHours * HOUR);
}

/** Split a released escrow amount between seller and platform fee. */
export function payoutSplit(amount: Kobo, bps = ESCROW_DEFAULTS.sellerFeeBps): { seller: Kobo; fee: Kobo } {
  const fee = feeBps(amount, bps);
  return { seller: amount - fee, fee };
}
