/** Photos on P2P ads: up to MAX_PHOTOS per ad, JPEG/PNG/WebP, shrunk in the browser first. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { listingImages, listings, users } from "./db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { AVATAR_TYPES } from "./sellers";

export const MAX_PHOTOS = 6;
const MAX_BYTES = 500 * 1024;

/** URL of one photo. Photo ids never change content, so browsers cache them for good. */
export const listingImageUrl = (id: string) => `/api/listings/images/${id}`;

/** SQL: the ad's photo URLs in order (for list queries). */
export const imageUrlsSql = sql<string[]>`(SELECT coalesce(array_agg('/api/listings/images/' || i.id::text ORDER BY i.position, i.created_at), '{}') FROM listing_images i WHERE i.listing_id = "listings"."id")`;

async function ownListing(db: Db, sellerId: string, listingId: string) {
  const [l] = await db.select({ id: listings.id, status: listings.status }).from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId)));
  if (!l || l.status === "removed") throw notFound("Ad");
  const [u] = await db.select({ s: users.sellerStatus }).from(users).where(eq(users.id, sellerId));
  if (u?.s !== "verified") throw forbidden("Only verified sellers can add photos.");
  return l;
}

export async function addListingImage(db: Db, sellerId: string, listingId: string, dataUrl: string) {
  await ownListing(db, sellerId, listingId);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest("Upload a JPG, PNG or WebP photo.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > MAX_BYTES) throw badRequest("That photo is too big. Try a smaller one.");
  if (!AVATAR_TYPES[m[1]](data)) throw badRequest("That file isn't a valid photo.");
  return db.transaction(async (tx) => {
    await tx.select({ id: listings.id }).from(listings).where(eq(listings.id, listingId)).for("update");
    const [{ n, last }] = await tx.select({ n: sql<number>`count(*)::int`, last: sql<number>`coalesce(max(${listingImages.position}), -1)::int` })
      .from(listingImages).where(eq(listingImages.listingId, listingId));
    if (n >= MAX_PHOTOS) throw badRequest(`An ad can have up to ${MAX_PHOTOS} photos. Remove one first.`);
    const [row] = await tx.insert(listingImages).values({ listingId, position: last + 1, contentType: m[1], data }).returning({ id: listingImages.id });
    return { id: row.id, url: listingImageUrl(row.id) };
  });
}

export async function removeListingImage(db: Db, sellerId: string, listingId: string, imageId: string) {
  await ownListing(db, sellerId, listingId);
  await db.delete(listingImages).where(and(eq(listingImages.id, imageId), eq(listingImages.listingId, listingId)));
  return { ok: true };
}

/** Move a photo to the front (it becomes the cover shown in the marketplace). */
export async function makeCover(db: Db, sellerId: string, listingId: string, imageId: string) {
  await ownListing(db, sellerId, listingId);
  const rows = await db.select({ id: listingImages.id }).from(listingImages).where(eq(listingImages.listingId, listingId)).orderBy(asc(listingImages.position), asc(listingImages.createdAt));
  const order = [imageId, ...rows.map((r) => r.id).filter((id) => id !== imageId)];
  await db.transaction(async (tx) => {
    for (const [i, id] of order.entries()) await tx.update(listingImages).set({ position: i }).where(and(eq(listingImages.id, id), eq(listingImages.listingId, listingId)));
  });
  return { ok: true };
}

/** The photo bytes, for any ad that hasn't been removed (ids are random, so they can't be guessed). */
export async function listingImageFile(db: Db, imageId: string) {
  const [r] = await db.select({ contentType: listingImages.contentType, data: listingImages.data })
    .from(listingImages).innerJoin(listings, eq(listings.id, listingImages.listingId))
    .where(and(eq(listingImages.id, imageId), sql`${listings.status} <> 'removed'`));
  return r ?? null;
}
