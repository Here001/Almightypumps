/**
 * P2P marketplace with escrow. The buyer's money is held from the moment a
 * trade is created and only moves when the escrow state machine says so.
 */
import { alertAdmins } from "./adminAlerts";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { checkListing, type ListingInput } from "@/core/listingPolicy";
import { ESCROW_DEFAULTS, payoutSplit, shipDeadline, transition, type ActorRole, type TradeAction } from "@/core/escrow";
import { checkAnswers } from "@/core/listingQuestions";
import { blockedReasons } from "@/core/listingPolicy";
import type { Db } from "./db";
import { allCategories, getCategory } from "./listingCategories";
import { disputes, listingCategories, listings, sellerAvatars, sellerProfiles, sellerReports, tradeEvents, tradeMessages, trades, users } from "./db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { avatarUrl } from "./sellers";
import { imageUrlsSql } from "./listingImages";
import { sendNotice } from "./email";
import { env } from "./env";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

/**
 * Validate an ad against the admin's categories: policy, the category's questions, and whether
 * the category needs approval. Returns the cleaned answers and review reasons.
 */
async function prepareListing(db: Db, input: ListingInput & { answers?: unknown }) {
  const cats = await allCategories(db, { activeOnly: true });
  const check = checkListing(input, cats.map((c) => c.slug));
  const cat = await getCategory(db, input.category);
  const { answers, problems } = cat ? checkAnswers(cat.questions, input.answers) : { answers: {}, problems: [] as string[] };
  const answerText = Object.values(answers).join("\n");
  const problemsAll = [...check.problems, ...problems, ...blockedReasons(answerText).filter((r) => !check.problems.includes(r))];
  if (problemsAll.length) throw badRequest("Please fix the listing and try again.", problemsAll);
  const review = [...check.review];
  if (cat?.requiresReview && !review.length) review.push(`Ads in “${cat.name}” are checked by our team before going live.`);
  return { answers, review };
}

/** Fixed price, or negotiable (no price; optional guide price shown to buyers and hidden lowest offer). */
function priceFields(input: ListingInput) {
  return input.negotiable
    ? { price: null, negotiable: true, guidePrice: input.guidePriceKobo ?? null, minOffer: input.minOfferKobo ?? null }
    : { price: input.priceKobo, negotiable: false, guidePrice: null, minOffer: null };
}

export async function createListing(db: Db, sellerId: string, input: ListingInput & { answers?: unknown }) {
  const [seller] = await db.select({ sellerStatus: users.sellerStatus }).from(users).where(eq(users.id, sellerId));
  if (!seller) throw notFound("Account");
  if (seller.sellerStatus !== "verified") {
    throw forbidden("Verify your seller account (ID and bank details) before posting an ad.");
  }
  const check = await prepareListing(db, input);
  const [row] = await db
    .insert(listings)
    .values({
      sellerId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      deliveryType: input.deliveryType,
      ...priceFields(input),
      stock: input.stock,
      minQty: input.minQty,
      maxQty: input.maxQty,
      answers: check.answers,
      // Borderline listings wait for an admin instead of being rejected.
      status: check.review.length ? "pending" : "active",
      reviewNote: check.review.length ? check.review.join(" ") : null,
    })
    .returning();
  if (check.review.length) alertAdmins(db, `Ad to review: ${row.title}`, ["A seller posted an ad that needs your approval before it goes live.", `Why: ${check.review.join(" ")}`], "/admin/listings", { customerId: sellerId });
  return { ...row, message: check.review.length ? "Thanks! Your ad will go live once our team has checked it, usually within a few hours." : "Your ad is live." };
}

/** Admin review queue: pending (default) or declined listings, newest first. */
export async function listingsForReview(db: Db, status: "pending" | "declined" = "pending") {
  return db
    .select({
      id: listings.id, title: listings.title, description: listings.description, category: listings.category,
      price: listings.price, negotiable: listings.negotiable, guidePrice: listings.guidePrice, stock: listings.stock, reviewNote: listings.reviewNote, createdAt: listings.createdAt,
      sellerName: users.name, sellerEmail: users.email, images: imageUrlsSql,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.status, status))
    .orderBy(sql`${listings.createdAt} DESC`)
    .limit(100);
}

/** Approve (goes live) or decline (with a note the seller can see) a listing waiting for review. */
export async function reviewListing(db: Db, listingId: string, decision: "approve" | "decline", note?: string) {
  const [row] = await db
    .update(listings)
    .set(decision === "approve" ? { status: "active", reviewNote: null } : { status: "declined", reviewNote: note?.trim() || "Declined by our team." })
    .where(and(eq(listings.id, listingId), sql`${listings.status} IN ('pending', 'declined')`))
    .returning({ id: listings.id, status: listings.status });
  if (!row) throw notFound("Listing waiting for review");
  return row;
}

export async function browseListings(db: Db, opts: { category?: string; q?: string; sort?: "new" | "price_asc" | "price_desc"; limit?: number; offset?: number }) {
  const filters = [eq(listings.status, "active"), sql`${listings.stock} > 0`];
  if (opts.category) filters.push(eq(listings.category, opts.category));
  const words = (opts.q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  for (const w of words) {
    const like = `%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    filters.push(sql`(${listings.title} ILIKE ${like} OR ${listings.description} ILIKE ${like})`);
  }
  // Negotiable ads sort by their guide price (or last, if they have none).
  const shown = sql`coalesce(${listings.price}, ${listings.guidePrice})`;
  const order = opts.sort === "price_asc" ? [sql`${shown} asc nulls last`] : opts.sort === "price_desc" ? [sql`${shown} desc nulls last`] : [desc(listings.createdAt)];
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      category: listings.category,
      categoryName: listingCategories.name,
      deliveryType: listings.deliveryType,
      price: listings.price,
      negotiable: listings.negotiable,
      guidePrice: listings.guidePrice,
      stock: listings.stock,
      minQty: listings.minQty,
      maxQty: listings.maxQty,
      answers: listings.answers,
      images: imageUrlsSql,
      createdAt: listings.createdAt,
      sellerId: listings.sellerId,
      sellerName: sql<string>`coalesce(${sellerProfiles.businessName}, ${users.name})`,
      sellerVerified: sql<boolean>`${users.sellerStatus} = 'verified'`,
      sellerAvatarAt: sellerAvatars.updatedAt,
      sellerOrders: sql<number>`(select count(*)::int from trades t where t.seller_id = "listings"."seller_id" and t.status = 'COMPLETED')`,
      sellerClosed: sql<number>`(select count(*)::int from trades t where t.seller_id = "listings"."seller_id" and t.status in ('COMPLETED','CANCELLED','REFUNDED'))`,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, listings.sellerId))
    .leftJoin(listingCategories, eq(listingCategories.slug, listings.category))
    .leftJoin(sellerAvatars, eq(sellerAvatars.userId, listings.sellerId))
    .where(and(...filters))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(opts.offset ?? 0);
  const out = rows.slice(0, limit).map(({ sellerAvatarAt, ...r }) => ({
    ...r,
    sellerAvatar: sellerAvatarAt && r.sellerVerified ? avatarUrl(r.sellerId, sellerAvatarAt) : null,
  }));
  return { listings: out, hasMore: rows.length > limit };
}

/** Buy: lock stock, hold the buyer's money, open the trade. */
export async function buy(db: Db, buyerId: string, listingId: string, quantity: number) {
  const t = await buyTx(db, buyerId, listingId, quantity);
  void notifyTrade(db, t.sellerId, `New order #M-${t.publicId}: please deliver`, [
    `Someone bought your ad (order #M-${t.publicId}, quantity ${t.quantity}). The money is safe in escrow.`,
    "Deliver within 72 hours, then tap “Mark as delivered” in the trade room. If you can't deliver, cancel so the buyer is refunded.",
  ]);
  return t;
}

async function buyTx(db: Db, buyerId: string, listingId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(listings).where(eq(listings.id, listingId)).for("update");
    if (!l || l.status !== "active") throw notFound("Listing");
    if (l.sellerId === buyerId) throw badRequest("You can't buy your own listing.");
    if (!Number.isInteger(quantity) || quantity < l.minQty || quantity > l.maxQty) {
      throw badRequest(`Choose a quantity between ${l.minQty} and ${l.maxQty}.`);
    }
    if (quantity > l.stock) throw badRequest(`Only ${l.stock} left in stock.`);
    if (l.negotiable || l.price == null) throw badRequest("This ad is negotiable: make an offer instead.");

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
  const updated = await actTx(db, tradeId, action, actor, extra);
  if (action === "ESCALATE") {
    alertAdmins(db, `Dispute opened on P2P order #M-${updated.publicId}`, [
      actor.userId ? "The buyer asked to cancel and the seller refused, so the order went to dispute. The money stays in escrow until you decide."
        : "The buyer asked to cancel and the seller didn't answer within 24 hours, so the order went to dispute. The money stays in escrow until you decide.",
      `Buyer's reason: ${updated.cancelReason ?? "No reason given"}`,
      ...(extra.note ? [`Seller says: ${extra.note}`] : []),
    ], "/admin/disputes", { customerId: updated.buyerId, amountKobo: updated.amount });
    void notifyTrade(db, updated.buyerId, `Order #M-${updated.publicId} is now a dispute`, [
      actor.userId ? "The seller didn't agree to cancel your order, so our team will look at it." : "The seller didn't answer your cancellation request within 24 hours, so our team will look at it.",
      "Your money stays safe in escrow until we decide. You can add details in the trade room chat.",
    ]);
  }
  if (action === "CANCEL_AGREED") {
    void notifyTrade(db, updated.buyerId, `Order #M-${updated.publicId} cancelled: money returned`, [
      "The seller agreed to cancel your order. The full amount is back in your Almighty Pumps wallet.",
    ]);
  }
  if (action === "DISPUTE") {
    alertAdmins(db, `Dispute opened on P2P order #M-${updated.publicId}`, [
      "The buyer says something is wrong with their order. The money stays in escrow until you decide.",
      `Complaint: ${extra.note?.trim() || "No reason given"}`,
    ], "/admin/disputes", { customerId: updated.buyerId, amountKobo: updated.amount });
  }
  if (action === "SHIP") {
    void notifyTrade(db, updated.buyerId, `Order #M-${updated.publicId} was delivered: please check it`, [
      `The seller marked P2P order #M-${updated.publicId} as delivered.`,
      "Check what you received, then tap “Confirm received”. If something's wrong, tap “Something's wrong” within 48 hours, or the seller is paid automatically.",
    ]);
  }
  return updated;
}

async function actTx(
  db: Db,
  tradeId: string,
  action: TradeAction,
  actor: { userId: string | null; isAdmin?: boolean },
  extra: { note?: string; deliveryProof?: string },
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

    if (action === "SHIP" && t.cancelStatus === "pending") throw badRequest("The buyer asked to cancel this order. Accept or refuse the request first.");
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
        // A cancellation request is answered (accept / refuse / no answer) or overtaken by the trade ending some other way.
        cancelStatus: t.cancelStatus !== "pending" ? t.cancelStatus
          : action === "CANCEL_AGREED" ? "accepted"
          : action === "ESCALATE" ? (role === "system" ? "expired" : "rejected")
          : r.status !== "PAID" && r.status !== "SHIPPED" ? "closed" : t.cancelStatus,
      })
      .where(eq(trades.id, t.id))
      .returning();

    await tx.insert(tradeEvents).values({ tradeId: t.id, actorId: actor.userId, action, fromStatus: t.status, toStatus: r.status, note: extra.note });

    if (action === "DISPUTE") {
      await tx.insert(disputes).values({ tradeId: t.id, openedBy: actor.userId!, reason: extra.note?.trim() || "No reason given" });
    }
    if (action === "ESCALATE") {
      const why = role === "system" ? "The seller didn't answer the buyer's cancellation request within 24 hours." : `The seller refused the buyer's cancellation request.${extra.note?.trim() ? ` Seller says: ${extra.note.trim()}` : ""}`;
      await tx.insert(disputes).values({ tradeId: t.id, openedBy: t.buyerId, reason: `Buyer asked to cancel: ${t.cancelReason ?? "no reason given"}. ${why}` });
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
    // A delivered order whose buyer is waiting on a cancellation answer is not paid out automatically.
    .where(and(eq(trades.status, "SHIPPED"), lte(trades.inspectionEndsAt, now), sql`${trades.cancelStatus} is distinct from 'pending'`))
    .limit(200);
  const dueCancel = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.status, "PAID"), lte(trades.shipBy, now)))
    .limit(200);

  // Cancellation requests the seller ignored for 24 hours go to dispute (a PAID order past its ship deadline is refunded instead).
  const dueEscalate = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.cancelStatus, "pending"), inArray(trades.status, ["PAID", "SHIPPED"]),
      lte(trades.cancelRequestedAt, new Date(now.getTime() - CANCEL_ANSWER_HOURS * 3_600_000))))
    .limit(200);

  const result = { released: 0, cancelled: 0, escalated: 0, errors: [] as string[] };
  for (const { id } of dueRelease) {
    try { await act(db, id, "AUTO_RELEASE", { userId: null }); result.released++; } catch (e) { result.errors.push(`${id}: ${(e as Error).message}`); }
  }
  for (const { id } of dueCancel) {
    try { await act(db, id, "AUTO_CANCEL", { userId: null }); result.cancelled++; } catch (e) { result.errors.push(`${id}: ${(e as Error).message}`); }
  }
  for (const { id } of dueEscalate) {
    if (dueCancel.some((d) => d.id === id)) continue;
    try { await act(db, id, "ESCALATE", { userId: null }); result.escalated++; } catch (e) { result.errors.push(`${id}: ${(e as Error).message}`); }
  }
  // Offers on negotiable ads that nobody answered in time: give the buyer's money back.
  const { expireOffers } = await import("./offers");
  const expired = await expireOffers(db, now).catch((e) => { result.errors.push(`offers: ${(e as Error).message}`); return 0; });
  return { ...result, offersExpired: expired };
}

export async function tradeForUser(db: Db, tradeId: string, userId: string, isAdmin = false) {
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) throw notFound("Trade");
  const [t] = await db.select().from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (!isAdmin && t.buyerId !== userId && t.sellerId !== userId) throw forbidden();
  const events = await db.select().from(tradeEvents).where(eq(tradeEvents.tradeId, t.id)).orderBy(tradeEvents.createdAt);
  const messages = await db.select().from(tradeMessages).where(eq(tradeMessages.tradeId, t.id)).orderBy(tradeMessages.createdAt);
  const [l] = await db.select({ title: listings.title, deliveryType: listings.deliveryType, images: imageUrlsSql }).from(listings).where(eq(listings.id, t.listingId));
  const people = await db.select({ id: users.id, name: users.name, shop: sellerProfiles.businessName })
    .from(users).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id)).where(inArray(users.id, [t.buyerId, t.sellerId]));
  const nameOf = (id: string) => { const p = people.find((x) => x.id === id); return id === t.sellerId ? (p?.shop || p?.name || "Seller") : (p?.name.split(" ")[0] || "Buyer"); };
  const { holdId: _hold, ...trade } = t;
  void _hold;
  const [reported] = t.buyerId === userId
    ? await db.select({ id: sellerReports.id }).from(sellerReports).where(and(eq(sellerReports.tradeId, t.id), eq(sellerReports.reporterId, userId))).limit(1)
    : [];
  return {
    trade, events, messages,
    listing: { title: l?.title ?? "", deliveryType: l?.deliveryType ?? "", images: l?.images ?? [] },
    buyerName: nameOf(t.buyerId), sellerName: nameOf(t.sellerId),
    role: t.buyerId === userId ? "buyer" : t.sellerId === userId ? "seller" : "admin",
    sellerReceives: payoutSplit(t.amount, ESCROW_DEFAULTS.sellerFeeBps).seller,
    reported: Boolean(reported),
    cancelAnswerBy: t.cancelStatus === "pending" && t.cancelRequestedAt ? new Date(t.cancelRequestedAt.getTime() + CANCEL_ANSWER_HOURS * 3_600_000) : null,
  };
}

export async function postMessage(db: Db, tradeId: string, senderId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw badRequest("Messages must be between 1 and 2,000 characters.");
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) throw notFound("Trade");
  const [t] = await db.select({ buyerId: trades.buyerId, sellerId: trades.sellerId, publicId: trades.publicId }).from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (senderId !== t.buyerId && senderId !== t.sellerId) throw forbidden();
  // Email the other person about a new chat, but not for every message: only if this sender was quiet for 30 minutes.
  const [recent] = await db.select({ id: tradeMessages.id }).from(tradeMessages)
    .where(and(eq(tradeMessages.tradeId, tradeId), eq(tradeMessages.senderId, senderId), sql`${tradeMessages.createdAt} > now() - interval '30 minutes'`)).limit(1);
  const [m] = await db.insert(tradeMessages).values({ tradeId, senderId, body: text }).returning();
  if (!recent) {
    const to = senderId === t.buyerId ? t.sellerId : t.buyerId;
    void notifyTrade(db, to, `New message on order #M-${t.publicId}`, [
      `You have a new message about P2P order #M-${t.publicId}:`,
      `“${text.length > 300 ? text.slice(0, 300) + "…" : text}”`,
      "Reply in the trade room. Never pay or share passwords outside Almighty Pumps.",
    ]);
  }
  return m;
}

/** Email one customer about their trade (fire and forget). */
export async function notifyTrade(db: Db, userId: string, subject: string, lines: string[]) {
  try {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (u) await sendNotice([u.email], subject, lines, { href: `${appUrl()}/dashboard#my-trades`, label: "Open my trades" });
  } catch (e) {
    console.error("[market] notify", e);
  }
}
const appUrl = () => (env().APP_URL || "https://almightypumps.com").replace(/\/+$/, "");

export async function myTrades(db: Db, userId: string) {
  return db
    .select({ id: trades.id, publicId: trades.publicId, status: trades.status, amount: trades.amount, buyerId: trades.buyerId, sellerId: trades.sellerId, title: listings.title, shipBy: trades.shipBy, inspectionEndsAt: trades.inspectionEndsAt, deliveryProof: trades.deliveryProof, createdAt: trades.createdAt })
    .from(trades)
    .innerJoin(listings, eq(listings.id, trades.listingId))
    .where(sql`${trades.buyerId} = ${userId} or ${trades.sellerId} = ${userId}`)
    .orderBy(desc(trades.createdAt))
    .limit(50);
}

export async function openDisputes(db: Db) {
  return db.select().from(trades).where(inArray(trades.status, ["DISPUTED"])).orderBy(trades.createdAt);
}

/* ---------------- seller panel ---------------- */

/** A seller's own ads with sales counts. */
export async function myListings(db: Db, sellerId: string) {
  return db
    .select({
      id: listings.id, title: listings.title, description: listings.description, category: listings.category,
      deliveryType: listings.deliveryType, price: listings.price, negotiable: listings.negotiable, guidePrice: listings.guidePrice,
      minOffer: listings.minOffer, stock: listings.stock, minQty: listings.minQty,
      maxQty: listings.maxQty, status: listings.status, reviewNote: listings.reviewNote, createdAt: listings.createdAt,
      answers: listings.answers, images: imageUrlsSql,
      sold: sql<number>`(SELECT coalesce(sum(t.quantity), 0)::int FROM trades t WHERE t.listing_id = "listings"."id" AND t.status = 'COMPLETED')`,
      openOrders: sql<number>`(SELECT count(*)::int FROM trades t WHERE t.listing_id = "listings"."id" AND t.status IN ('PAID', 'SHIPPED', 'DISPUTED'))`,
      openOffers: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.listing_id = "listings"."id" AND o.status IN ('pending', 'countered'))`,
    })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), sql`${listings.status} <> 'removed'`))
    .orderBy(desc(listings.createdAt));
}

/** Edit an ad. Policy is checked again; anything flagged (or previously declined) goes back to review. */
export async function updateListing(db: Db, sellerId: string, listingId: string, input: ListingInput & { answers?: unknown }) {
  const [l] = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId)));
  if (!l || l.status === "removed") throw notFound("Listing");
  const check = await prepareListing(db, input);
  const needsReview = check.review.length > 0 || l.status === "pending" || l.status === "declined";
  const [row] = await db
    .update(listings)
    .set({
      title: input.title.trim(), description: input.description.trim(), category: input.category, deliveryType: input.deliveryType,
      ...priceFields(input), stock: input.stock, minQty: input.minQty, maxQty: input.maxQty, answers: check.answers,
      status: needsReview ? "pending" : l.status,
      reviewNote: needsReview ? (check.review.join(" ") || "Edited after review; checking again.") : null,
    })
    .where(eq(listings.id, l.id))
    .returning();
  if (needsReview && l.status !== "pending") alertAdmins(db, `Ad to review: ${row.title}`, ["A seller edited an ad and it needs your approval again.", row.reviewNote ?? ""].filter(Boolean), "/admin/listings", { customerId: sellerId });
  return { ...row, message: needsReview ? "Saved. Your ad will go live again once our team has checked it." : "Saved." };
}

/** Pause, resume or remove an ad. Open orders on it carry on as normal. */
export async function setListingStatus(db: Db, sellerId: string, listingId: string, action: "pause" | "resume" | "remove") {
  const [l] = await db.select({ id: listings.id, status: listings.status }).from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId)));
  if (!l || l.status === "removed") throw notFound("Listing");
  if (action === "pause" && l.status !== "active") throw badRequest("Only live ads can be paused.");
  if (action === "resume" && l.status !== "paused") throw badRequest("Only paused ads can be resumed.");
  const status = action === "pause" ? "paused" : action === "resume" ? "active" : "removed";
  const [row] = await db.update(listings).set({ status }).where(eq(listings.id, l.id)).returning({ id: listings.id, status: listings.status });
  return row;
}

/** Orders on a seller's ads, newest first, with what they'll receive after the escrow fee. */
export async function sellerOrders(db: Db, sellerId: string) {
  const rows = await db
    .select({
      id: trades.id, publicId: trades.publicId, status: trades.status, quantity: trades.quantity, amount: trades.amount,
      shipBy: trades.shipBy, inspectionEndsAt: trades.inspectionEndsAt, deliveryProof: trades.deliveryProof, createdAt: trades.createdAt,
      title: listings.title, deliveryType: listings.deliveryType, buyerName: users.name,
    })
    .from(trades)
    .innerJoin(listings, eq(listings.id, trades.listingId))
    .innerJoin(users, eq(users.id, trades.buyerId))
    .where(eq(trades.sellerId, sellerId))
    .orderBy(desc(trades.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, youReceive: payoutSplit(r.amount, ESCROW_DEFAULTS.sellerFeeBps).seller }));
}

/** How long the seller has to answer a buyer's cancellation request before it becomes a dispute. */
export const CANCEL_ANSWER_HOURS = 24;

/**
 * Buyer asks to cancel. Before the ship deadline (or after delivery) the seller must agree, so this only records the
 * request and tells the seller. Late, undelivered orders are cancelled at once by the normal CANCEL action instead.
 */
export async function requestCancel(db: Db, tradeId: string, buyerId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 5 || why.length > 1000) throw badRequest("Please tell the seller why you want to cancel (at least a few words).");
  const t = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(trades).where(eq(trades.id, tradeId)).for("update");
    if (!t) throw notFound("Trade");
    if (t.buyerId !== buyerId) throw forbidden();
    if (t.status !== "PAID" && t.status !== "SHIPPED") throw badRequest("This order can't be cancelled now.");
    if (t.cancelStatus === "pending") throw badRequest("You already asked to cancel. Waiting for the seller to answer.");
    if (t.cancelStatus === "rejected" || t.cancelStatus === "expired") throw badRequest("You already asked once. Raise a dispute if something is wrong.");
    const [u] = await tx.update(trades).set({ cancelStatus: "pending", cancelReason: why, cancelRequestedAt: new Date() }).where(eq(trades.id, t.id)).returning();
    await tx.insert(tradeEvents).values({ tradeId: t.id, actorId: buyerId, action: "REQUEST_CANCEL", fromStatus: t.status, toStatus: t.status, note: why });
    return u;
  });
  void notifyTrade(db, t.sellerId, `Buyer wants to cancel order #M-${t.publicId}`, [
    `The buyer asked to cancel P2P order #M-${t.publicId}.`,
    `Reason: “${why.length > 300 ? why.slice(0, 300) + "…" : why}”`,
    `Open the trade room and tap Accept (the buyer gets their money back) or Refuse (our team reviews it as a dispute). If you don't answer within ${CANCEL_ANSWER_HOURS} hours, it goes to dispute.`,
  ]);
  return t;
}

/** Seller answers a cancellation request: accept = refund the buyer, refuse = dispute for the admins. */
export async function answerCancel(db: Db, tradeId: string, sellerId: string, accept: boolean, note?: string) {
  const [t] = await db.select({ sellerId: trades.sellerId, cancelStatus: trades.cancelStatus }).from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (t.sellerId !== sellerId) throw forbidden();
  if (t.cancelStatus !== "pending") throw badRequest("There is no cancellation request to answer.");
  return act(db, tradeId, accept ? "CANCEL_AGREED" : "ESCALATE", { userId: sellerId }, { note: note?.trim() || undefined });
}

export const REPORT_REASONS = [
  "Asked me to pay or talk outside Almighty Pumps",
  "Scam or fraud attempt",
  "Item is fake or not as described",
  "Rude, threatening or abusive",
  "Something else",
] as const;

/** Buyer reports the seller of one of their trades to the admins (once per trade). Money is not affected. */
export async function reportSeller(db: Db, tradeId: string, buyerId: string, reason: string, details: string) {
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw badRequest("Pick a reason.");
  const text = details.trim();
  if (reason === "Something else" && text.length < 5) throw badRequest("Please describe what happened.");
  if (text.length > 2000) throw badRequest("Please keep it under 2,000 characters.");
  const [t] = await db.select({ id: trades.id, buyerId: trades.buyerId, sellerId: trades.sellerId, publicId: trades.publicId }).from(trades).where(eq(trades.id, tradeId));
  if (!t) throw notFound("Trade");
  if (t.buyerId !== buyerId) throw forbidden();
  const [row] = await db.insert(sellerReports).values({ tradeId: t.id, reporterId: buyerId, sellerId: t.sellerId, reason, details: text || null })
    .onConflictDoNothing().returning();
  if (!row) throw badRequest("You already reported this seller for this order. Our team is looking at it.");
  // Not added to the trade timeline: the seller sees that timeline, and a report stays between the buyer and us.
  alertAdmins(db, `Seller reported on P2P order #M-${t.publicId}`, [
    `A buyer reported the seller: ${reason}.`,
    ...(text ? [`Details: ${text.length > 400 ? text.slice(0, 400) + "…" : text}`] : []),
  ], "/admin/disputes#t=seller-reports", { customerId: t.sellerId });
  return { ok: true };
}
