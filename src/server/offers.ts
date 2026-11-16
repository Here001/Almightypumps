/**
 * Offers on negotiable P2P ads. The buyer names a price per item; their money is held from their wallet straight away,
 * so sellers only see serious offers. The seller accepts (it becomes a normal escrow trade, using the same held money),
 * declines, or counters with a new price. The buyer can accept a counter (the hold is resized), decline it, or withdraw.
 * Anything left unanswered expires after 24 hours and the money goes back to the buyer.
 */
import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { shipDeadline } from "@/core/escrow";
import type { Db, Tx } from "./db";
import { listings, offers, sellerProfiles, tradeEvents, trades, users } from "./db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { linkHold, placeHold, settleHold, walletIdForUser } from "./wallet";
import { notifyTrade } from "./market";

const OFFER_HOURS = 24;
const MAX_OPEN_PER_BUYER = 5;
const naira = (kobo: number) => "₦" + (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
const expiry = () => new Date(Date.now() + OFFER_HOURS * 3600_000);

type OfferRow = typeof offers.$inferSelect;
type ListingRow = typeof listings.$inferSelect;

async function releaseHold(tx: Tx, o: OfferRow, why: string) {
  await settleHold(tx, o.holdId, 0, [], { refType: "offer", refId: o.id, idempotencyKey: `offer:${o.holdId}:release`, memo: why });
}

/** Buyer: make an offer. Holds unit price × quantity from the wallet. */
export async function makeOffer(db: Db, buyerId: string, listingId: string, input: { unitPriceKobo: number; quantity: number; note?: string }) {
  const unit = Math.round(input.unitPriceKobo);
  if (!Number.isSafeInteger(unit) || unit < 10_000) throw badRequest("Offer at least ₦100 per item.");
  const note = input.note?.trim().slice(0, 300) || null;
  const o = await db.transaction(async (tx) => {
    const [l] = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update");
    if (!l || l.status !== "active") throw notFound("Listing");
    if (!l.negotiable) throw badRequest("This ad has a fixed price. Buy it at that price instead.");
    if (l.sellerId === buyerId) throw badRequest("You can't make an offer on your own ad.");
    const q = input.quantity;
    if (!Number.isInteger(q) || q < l.minQty || q > l.maxQty) throw badRequest(`Choose a quantity between ${l.minQty} and ${l.maxQty}.`);
    if (q > l.stock) throw badRequest(`Only ${l.stock} left in stock.`);
    // The seller's lowest acceptable price stays private: the buyer only learns that the offer is too low.
    if (l.minOffer && unit < l.minOffer) throw badRequest("The seller doesn't accept offers this low. Try a higher price.");
    const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(offers).where(and(eq(offers.buyerId, buyerId), inArray(offers.status, ["pending", "countered"])));
    if (open.n >= MAX_OPEN_PER_BUYER) throw badRequest(`You have ${MAX_OPEN_PER_BUYER} offers waiting. Wait for answers or withdraw one first.`);
    const [mine] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.listingId, l.id), eq(offers.buyerId, buyerId), inArray(offers.status, ["pending", "countered"])));
    if (mine) throw badRequest("You already have an offer on this ad. Withdraw it first to make a new one.");
    const wallet = await walletIdForUser(tx, buyerId);
    const holdId = await placeHold(tx, wallet, unit * q, "escrow", { memo: `Offer on "${l.title}"` });
    const [row] = await tx.insert(offers).values({ listingId: l.id, buyerId, sellerId: l.sellerId, quantity: q, unitPrice: unit, holdId, note, expiresAt: expiry() }).returning();
    await linkHold(tx, holdId, row.id);
    return { row, title: l.title };
  });
  void notifyTrade(db, o.row.sellerId, `New offer on “${o.title}”: ${naira(o.row.unitPrice)} each`, [
    `A buyer offered ${naira(o.row.unitPrice)} per item for ${o.row.quantity} × “${o.title}” (${naira(o.row.unitPrice * o.row.quantity)} in total). The money is already held.`,
    o.row.note ? `Their message: “${o.row.note}”` : "",
    `Accept, decline or send a counter-offer in your seller panel within ${OFFER_HOURS} hours, or the offer expires.`,
  ].filter(Boolean));
  return present(o.row, o.title);
}

/** Turn an agreed offer into a normal escrow trade, keeping the same held money. */
async function openTrade(tx: Tx, o: OfferRow, l: ListingRow, unit: number, actorId: string) {
  if (l.status !== "active") throw badRequest("This ad isn't live any more, so the offer can't be accepted.");
  if (o.quantity > l.stock) throw badRequest(`Only ${l.stock} left in stock. Decline the offer or update your stock.`);
  const [t] = await tx.insert(trades).values({
    listingId: l.id, buyerId: o.buyerId, sellerId: o.sellerId, quantity: o.quantity, amount: unit * o.quantity,
    holdId: o.holdId, shipBy: shipDeadline(new Date()), status: "PAID",
  }).returning();
  await linkHold(tx, o.holdId, t.id);
  await tx.update(listings).set({ stock: l.stock - o.quantity }).where(eq(listings.id, l.id));
  await tx.insert(tradeEvents).values({ tradeId: t.id, actorId, action: "PAY", fromStatus: null, toStatus: "PAID", note: `Offer #O-${o.publicId} agreed at ${naira(unit)} per item; funds locked in escrow` });
  await tx.update(offers).set({ status: "accepted", tradeId: t.id, unitPrice: unit, updatedAt: new Date() }).where(eq(offers.id, o.id));
  return t;
}

type Action = "accept" | "decline" | "counter" | "withdraw" | "accept_counter" | "decline_counter";

/** Seller: accept / decline / counter. Buyer: withdraw / accept_counter / decline_counter. */
export async function offerAction(db: Db, userId: string, offerId: string, action: Action, counterKobo?: number) {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) throw notFound("Offer");
  const res = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(offers).where(eq(offers.id, offerId)).for("update");
    if (!o) throw notFound("Offer");
    const isSeller = o.sellerId === userId, isBuyer = o.buyerId === userId;
    if (!isSeller && !isBuyer) throw forbidden();
    if (o.status !== "pending" && o.status !== "countered") throw badRequest("This offer has already been answered.");
    if (o.expiresAt.getTime() <= Date.now()) {
      await releaseHold(tx, o, "Offer expired");
      await tx.update(offers).set({ status: "expired", updatedAt: new Date() }).where(eq(offers.id, o.id));
      throw badRequest("This offer has expired. The buyer's money has gone back to their wallet.");
    }
    const [l] = await tx.select().from(listings).where(eq(listings.id, o.listingId)).for("update");
    const title = l?.title ?? "your ad";

    if (isSeller && action === "accept") {
      if (o.status !== "pending") throw badRequest("You've sent a counter-offer; wait for the buyer to answer it.");
      const t = await openTrade(tx, o, l!, o.unitPrice, userId);
      return { o, title, kind: "accepted" as const, trade: t };
    }
    if (isSeller && action === "decline") {
      await releaseHold(tx, o, "Offer declined");
      await tx.update(offers).set({ status: "declined", updatedAt: new Date() }).where(eq(offers.id, o.id));
      return { o, title, kind: "declined" as const };
    }
    if (isSeller && action === "counter") {
      if (o.status !== "pending") throw badRequest("You've already sent a counter-offer.");
      const c = Math.round(counterKobo ?? 0);
      if (!Number.isSafeInteger(c) || c < 10_000) throw badRequest("Counter with at least ₦100 per item.");
      if (c <= o.unitPrice) throw badRequest("A counter-offer must be higher than the buyer's offer. To take their price, accept it.");
      await tx.update(offers).set({ status: "countered", counterPrice: c, expiresAt: expiry(), updatedAt: new Date() }).where(eq(offers.id, o.id));
      return { o: { ...o, counterPrice: c }, title, kind: "countered" as const };
    }
    if (isBuyer && action === "withdraw") {
      await releaseHold(tx, o, "Offer withdrawn");
      await tx.update(offers).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(offers.id, o.id));
      return { o, title, kind: "withdrawn" as const };
    }
    if (isBuyer && action === "decline_counter") {
      if (o.status !== "countered") throw badRequest("There's no counter-offer to decline.");
      await releaseHold(tx, o, "Counter-offer declined");
      await tx.update(offers).set({ status: "declined", updatedAt: new Date() }).where(eq(offers.id, o.id));
      return { o, title, kind: "counter_declined" as const };
    }
    if (isBuyer && action === "accept_counter") {
      if (o.status !== "countered" || !o.counterPrice) throw badRequest("There's no counter-offer to accept.");
      // Resize the held money to the counter price: release the old hold, hold the new total (fails if the wallet is short).
      await releaseHold(tx, o, "Replaced by the agreed price");
      const wallet = await walletIdForUser(tx, o.buyerId);
      const holdId = await placeHold(tx, wallet, o.counterPrice * o.quantity, "escrow", { memo: `Agreed price on "${title}"` });
      const fresh = { ...o, holdId };
      await tx.update(offers).set({ holdId }).where(eq(offers.id, o.id));
      const t = await openTrade(tx, fresh, l!, o.counterPrice, userId);
      return { o: fresh, title, kind: "counter_accepted" as const, trade: t };
    }
    throw forbidden();
  });

  const { o, title } = res;
  const deal = (unit: number) => `${o.quantity} × “${title}” at ${naira(unit)} each (${naira(unit * o.quantity)})`;
  if (res.kind === "accepted" && res.trade) {
    void notifyTrade(db, o.buyerId, `Offer accepted: order #M-${res.trade.publicId}`, [`The seller accepted your offer: ${deal(o.unitPrice)}. Your held money is now in escrow.`, "The seller has 72 hours to deliver. Follow it in the trade room."]);
  } else if (res.kind === "declined") {
    void notifyTrade(db, o.buyerId, `Offer declined on “${title}”`, [`The seller declined your offer of ${naira(o.unitPrice)} each. ${naira(o.unitPrice * o.quantity)} is back in your wallet.`]);
  } else if (res.kind === "countered") {
    void notifyTrade(db, o.buyerId, `Counter-offer on “${title}”: ${naira(o.counterPrice!)} each`, [`The seller would sell ${deal(o.counterPrice!)}.`, `Accept or decline it in My offers within ${OFFER_HOURS} hours. Accepting starts the trade straight away.`]);
  } else if (res.kind === "counter_accepted" && res.trade) {
    void notifyTrade(db, o.sellerId, `Counter-offer accepted: order #M-${res.trade.publicId}`, [`The buyer accepted your price: ${deal(o.counterPrice!)}. The money is in escrow.`, "Deliver within 72 hours, then tap “Mark as delivered” in the trade room."]);
  } else if (res.kind === "counter_declined" || res.kind === "withdrawn") {
    void notifyTrade(db, o.sellerId, `Offer on “${title}” ${res.kind === "withdrawn" ? "withdrawn" : "declined"}`, [res.kind === "withdrawn" ? "The buyer withdrew their offer." : "The buyer declined your counter-offer."]);
  }
  return { status: res.kind, tradeId: "trade" in res && res.trade ? res.trade.id : null };
}

function present(o: OfferRow, title: string, other?: string | null) {
  const open = o.status === "pending" || o.status === "countered";
  return {
    id: o.id, publicId: o.publicId, listingId: o.listingId, title, quantity: o.quantity, unitPrice: o.unitPrice, counterPrice: o.counterPrice,
    total: o.unitPrice * o.quantity, status: o.status, note: o.note, tradeId: o.tradeId, expiresAt: open ? o.expiresAt : null, createdAt: o.createdAt, other: other ?? null,
  };
}

/** Offers I made (buyer) and offers on my ads (seller), newest first. */
export async function myOffers(db: Db, userId: string) {
  await expireOffers(db).catch(() => 0);
  const rows = await db.select({ o: offers, title: listings.title, buyerName: users.name, shop: sellerProfiles.businessName })
    .from(offers).innerJoin(listings, eq(listings.id, offers.listingId))
    .innerJoin(users, eq(users.id, offers.buyerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, offers.sellerId))
    .where(or(eq(offers.buyerId, userId), eq(offers.sellerId, userId)))
    .orderBy(desc(offers.updatedAt)).limit(100);
  return {
    asBuyer: rows.filter((r) => r.o.buyerId === userId).map((r) => present(r.o, r.title, r.shop)),
    asSeller: rows.filter((r) => r.o.sellerId === userId).map((r) => present(r.o, r.title, r.buyerName.split(" ")[0])),
  };
}

/** Cron (and on read): expire unanswered offers and return the held money. */
export async function expireOffers(db: Db, now = new Date()) {
  const due = await db.select({ id: offers.id }).from(offers).where(and(inArray(offers.status, ["pending", "countered"]), lte(offers.expiresAt, now))).limit(200);
  let n = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(offers).where(eq(offers.id, id)).for("update");
      if (!o || (o.status !== "pending" && o.status !== "countered") || o.expiresAt > now) return null;
      await releaseHold(tx, o, "Offer expired");
      await tx.update(offers).set({ status: "expired", updatedAt: new Date() }).where(eq(offers.id, o.id));
      return o;
    });
    if (done) {
      n++;
      void notifyTrade(db, done.buyerId, "Your offer expired", [`Nobody answered your offer in ${OFFER_HOURS} hours, so ${naira(done.unitPrice * done.quantity)} is back in your wallet.`]);
    }
  }
  return n;
}
