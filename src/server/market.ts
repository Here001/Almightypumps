/**
 * P2P marketplace with escrow. The buyer's money is held from the moment a
 * trade is created and only moves when the escrow state machine says so.
 */
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { checkListing, type ListingInput } from "@/core/listingPolicy";
import { ESCROW_DEFAULTS, payoutSplit, shipDeadline, transition, type ActorRole, type TradeAction } from "@/core/escrow";
import type { Db } from "./db";
import { disputes, listings, tradeEvents, tradeMessages, trades, users } from "./db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

export async function createListing(db: Db, sellerId: string, input: ListingInput) {
  const [seller] = await db.select({ sellerStatus: users.sellerStatus }).from(users).where(eq(users.id, sellerId));
  if (!seller) throw notFound("Account");
  if (seller.sellerStatus !== "verified") {
    throw forbidden("Verify your seller account (ID and bank details) before posting an ad.");
  }
  const check = checkListing(input);
  if (!check.ok) throw badRequest("Please fix the listing and try again.", check.problems);
  const [row] = await db
    .insert(listings)
    .values({
      sellerId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      deliveryType: input.deliveryType,
      price: input.priceKobo,
      stock: input.stock,
      minQty: input.minQty,
      maxQty: input.maxQty,
    })
    .returning();
  return row;
}

export async function browseListings(db: Db, opts: { category?: string; limit?: number; offset?: number }) {
  const where = opts.category
    ? and(eq(listings.status, "active"), eq(listings.category, opts.category))
    : eq(listings.status, "active");
  return db
    .select({
      id: listings.id,
      title: listings.title,
      category: listings.category,
      deliveryType: listings.deliveryType,
      price: listings.price,
      stock: listings.stock,
      minQty: listings.minQty,
      maxQty: listings.maxQty,
      sellerId: listings.sellerId,
      sellerName: users.name,
      sellerVerified: sql<boolean>`${users.sellerStatus} = 'verified'`,
      sellerOrders: sql<number>`(select count(*)::int from trades t where t.seller_id = ${listings.sellerId} and t.status = 'COMPLETED')`,
      sellerClosed: sql<number>`(select count(*)::int from trades t where t.seller_id = ${listings.sellerId} and t.status in ('COMPLETED','CANCELLED','REFUNDED'))`,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(where)
    .orderBy(desc(listings.createdAt))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
}

/** Buy: lock stock, hold the buyer's money, open the trade. */
export async function buy(db: Db, buyerId: string, listingId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update");
    if (!l || l.status !== "active") throw notFound("Listing");
    if (l.sellerId === buyerId) throw badRequest("You can't buy your own listing.");
    if (!Number.isInteger(quantity) || quantity < l.minQty || quantity > l.maxQty) {
      throw badRequest(`Choose a quantity between ${l.minQty} and ${l.maxQty}.`);
    }
    if (quantity > l.stock) throw badRequest(`Only ${l.stock} left in stock.`);

    const amount = l.price * quantity;
    const buyerWallet = await walletIdForUser(tx, buyerId);
    const holdId = await placeHold(tx, buyerWallet, amount, "escrow", { memo: `Escrow for "${l.title}"` });
    const now = new Date();
    const [t] = await tx
      .insert(trades)
      .values({ listingId, buyerId, sellerId: l.sellerId, quantity, amount, holdId, shipBy: shipDeadline(now), status: "PAID" })
      .returning();
    await linkHold(tx, holdId, t.id);
    await tx.update(listings).set({ stock: l.stock - quantity }).where(eq(listings.id, l.id));
    await tx.insert(tradeEvents).values({ tradeId: t.id, actorId: buyerId, action: "PAY", fromStatus: null, toStatus: "PAID", note: "Funds locked in escrow" });
    return t;
  });
}

/** Apply an action to a trade and move money if the state machine says so. */
export async function act(
  db: Db,
  tradeId: string,
  action: TradeAction,
  actor: { userId: string | null; isAdmin?: boolean },
  extra: { note?: string; deliveryProof?: string } = {},
) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(trades).where(eq(trades.id, tradeId)).for("update");
    if (!t) throw notFound("Trade");

    let role: ActorRole;
    if (actor.userId === null) role = "system";
    else if (actor.isAdmin && (action === "RESOLVE_BUYER" || action === "RESOLVE_SELLER" || action === "CANCEL")) role = "admin";
    else if (actor.userId === t.buyerId) role = "buyer";
    else if (actor.userId === t.sellerId) role = "seller";
    else throw forbidden();

    const now = new Date();
    const r = transition({ status: t.status, shipBy: t.shipBy, inspectionEndsAt: t.inspectionEndsAt }, action, role, now);

    let fee = t.fee;
    if (r.effect === "PAYOUT_SELLER") {
      const split = payoutSplit(t.amount, ESCROW_DEFAULTS.sellerFeeBps);
      fee = split.fee;
      const sellerWallet = await walletIdForUser(tx, t.sellerId);
      const platform = await platformWalletId(tx);
      await settleHold(
        tx,
        t.holdId,
        t.amount,
        [
          { walletId: sellerWallet, amount: split.seller, kind: "escrow:payout" },
          { walletId: platform, amount: split.fee, kind: "fee:escrow" },
        ],
        { refType: "trade", refId: t.id, idempotencyKey: `trade:${t.id}:settle` },
      );
    } else if (r.effect === "REFUND_BUYER") {
      await settleHold(tx, t.holdId, 0, [], { refType: "trade", refId: t.id, idempotencyKey: `trade:${t.id}:settle` });
      // Put the stock back on the listing.
      await tx.update(listings).set({ stock: sql`${listings.stock} + ${t.quantity}` }).where(eq(listings.id, t.listingId));
    }

    const [updated] = await tx
      .update(trades)
      .set({
        status: r.status,
        fee,
        shippedAt: r.patch.shippedAt ?? t.shippedAt,
        inspectionEndsAt: r.patch.inspectionEndsAt ?? t.inspectionEndsAt,
        closedAt: r.patch.closedAt ?? t.closedAt,
        deliveryProof: action === "SHIP" ? (extra.deliveryProof ?? t.deliveryProof) : t.deliveryProof,
      })
      .where(eq(trades.id, t.id))
      .returning();

    await tx.insert(tradeEvents).values({ tradeId: t.id, actorId: actor.userId, action, fromStatus: t.status, toStatus: r.status, note: extra.note });

    if (action === "DISPUTE") {
      await tx.insert(disputes).values({ tradeId: t.id, openedBy: actor.userId!, reason: extra.note?.trim() || "No reason given" });
    }
    if (action === "RESOLVE_BUYER" || action === "RESOLVE_SELLER") {
      await tx
        .update(disputes)
        .set({ resolution: action === "RESOLVE_BUYER" ? "refund_buyer" : "pay_seller", resolvedBy: actor.userId, resolvedAt: now })
        .where(eq(disputes.tradeId, t.id));
    }
    return updated;
  });
}

/** Cron: release inspected trades and cancel trades the seller never delivered. */
export async function runEscrowTimers(db: Db, now = new Date()) {
  const dueRelease = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.status, "SHIPPED"), lte(trades.inspectionEndsAt, now)))
    .limit(200);
  const dueCancel = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.status, "PAID"), lte(trades.shipBy, now)))
    .limit(200);

  const result = { released: 0, cancelled: 0, errors: [] as string[] };
  for (const { id } of dueRelease) {
    try { await act(db, id, "AUTO_RELEASE", { userId: null }); result.released++; } catch (e) { result.errors.push(`${id}: ${(e as Error).message}`); }
  }
  for (const { id } of dueCancel) {
    try { await act(db, id, "AUTO_CANCEL", { userId: null }); result.cancelled++; } catch (e) { result.errors.push(`${id}: ${(e as Error).message}`); }
  }
  return result;
}

export async function tradeForUser(db: Db, tradeId: string, userId: string, isAdmin = false) {
  const [t] = await db.select().from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (!isAdmin && t.buyerId !== userId && t.sellerId !== userId) throw forbidden();
  const events = await db.select().from(tradeEvents).where(eq(tradeEvents.tradeId, t.id)).orderBy(tradeEvents.createdAt);
  const messages = await db.select().from(tradeMessages).where(eq(tradeMessages.tradeId, t.id)).orderBy(tradeMessages.createdAt);
  return { trade: t, events, messages };
}

export async function postMessage(db: Db, tradeId: string, senderId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw badRequest("Messages must be between 1 and 2,000 characters.");
  const [t] = await db.select({ buyerId: trades.buyerId, sellerId: trades.sellerId }).from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (senderId !== t.buyerId && senderId !== t.sellerId) throw forbidden();
  const [m] = await db.insert(tradeMessages).values({ tradeId, senderId, body: text }).returning();
  return m;
}

export async function myTrades(db: Db, userId: string) {
  return db
    .select({ id: trades.id, publicId: trades.publicId, status: trades.status, amount: trades.amount, buyerId: trades.buyerId, sellerId: trades.sellerId, title: listings.title, shipBy: trades.shipBy, inspectionEndsAt: trades.inspectionEndsAt, createdAt: trades.createdAt })
    .from(trades)
    .innerJoin(listings, eq(listings.id, trades.listingId))
    .where(sql`${trades.buyerId} = ${userId} or ${trades.sellerId} = ${userId}`)
    .orderBy(desc(trades.createdAt))
    .limit(50);
}

export async function openDisputes(db: Db) {
  return db.select().from(trades).where(inArray(trades.status, ["DISPUTED"])).orderBy(trades.createdAt);
}
