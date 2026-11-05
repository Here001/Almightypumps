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
import { disputes, listingCategories, listings, sellerAvatars, sellerProfiles, tradeEvents, tradeMessages, trades, users } from "./db/schema";
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
      price: input.priceKobo,
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
      price: listings.price, stock: listings.stock, reviewNote: listings.reviewNote, createdAt: listings.createdAt,
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
  const order = opts.sort === "price_asc" ? [asc(listings.price)] : opts.sort === "price_desc" ? [desc(listings.price)] : [desc(listings.createdAt)];
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
  return {
    trade, events, messages,
    listing: { title: l?.title ?? "", deliveryType: l?.deliveryType ?? "", images: l?.images ?? [] },
    buyerName: nameOf(t.buyerId), sellerName: nameOf(t.sellerId),
    role: t.buyerId === userId ? "buyer" : t.sellerId === userId ? "seller" : "admin",
    sellerReceives: payoutSplit(t.amount, ESCROW_DEFAULTS.sellerFeeBps).seller,
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
async function notifyTrade(db: Db, userId: string, subject: string, lines: string[]) {
  try {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (u) await sendNotice([u.email], subject, lines, { href: `${appUrl()}/dashboard#trades`, label: "Open the trade room" });
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
      deliveryType: listings.deliveryType, price: listings.price, stock: listings.stock, minQty: listings.minQty,
      maxQty: listings.maxQty, status: listings.status, reviewNote: listings.reviewNote, createdAt: listings.createdAt,
      answers: listings.answers, images: imageUrlsSql,
      sold: sql<number>`(SELECT coalesce(sum(t.quantity), 0)::int FROM trades t WHERE t.listing_id = "listings"."id" AND t.status = 'COMPLETED')`,
      openOrders: sql<number>`(SELECT count(*)::int FROM trades t WHERE t.listing_id = "listings"."id" AND t.status IN ('PAID', 'SHIPPED', 'DISPUTED'))`,
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
      price: input.priceKobo, stock: input.stock, minQty: input.minQty, maxQty: input.maxQty, answers: check.answers,
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
