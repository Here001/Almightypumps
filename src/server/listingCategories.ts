/** P2P categories and their seller questions, managed in /admin/p2p-categories. */
import { asc, eq, sql } from "drizzle-orm";
import { blockedReasons } from "@/core/listingPolicy";
import { normaliseQuestions } from "@/core/listingQuestions";
import type { DbOrTx } from "./db";
import { listingCategories } from "./db/schema";
import { badRequest, notFound } from "./errors";
import { slugify } from "./shop";

export async function allCategories(db: DbOrTx, opts: { activeOnly?: boolean } = {}) {
  return db
    .select({
      slug: listingCategories.slug, name: listingCategories.name, description: listingCategories.description,
      questions: listingCategories.questions, requiresReview: listingCategories.requiresReview, active: listingCategories.active,
      ads: sql<number>`(SELECT count(*)::int FROM listings l WHERE l.category = "listing_categories"."slug" AND l.status = 'active')`,
    })
    .from(listingCategories)
    .where(opts.activeOnly ? eq(listingCategories.active, true) : undefined)
    .orderBy(asc(listingCategories.position), asc(listingCategories.createdAt));
}

export async function getCategory(db: DbOrTx, slug: string) {
  const [c] = await db.select().from(listingCategories).where(eq(listingCategories.slug, slug));
  return c ?? null;
}

export async function saveListingCategory(
  db: DbOrTx,
  input: { slug?: string; name: string; description?: string; questions?: unknown; requiresReview?: boolean; active?: boolean },
) {
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Give the category a name.");
  let questions;
  try {
    questions = normaliseQuestions(input.questions ?? []);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  const banned = blockedReasons(`${name}\n${input.description ?? ""}`);
  if (banned.length) throw badRequest(banned.join(" "));
  const values = {
    name: name.slice(0, 60), description: (input.description ?? "").trim().slice(0, 300), questions,
    requiresReview: input.requiresReview ?? false, active: input.active ?? true,
  };
  if (input.slug) {
    const [row] = await db.update(listingCategories).set(values).where(eq(listingCategories.slug, input.slug)).returning();
    if (!row) throw notFound("Category");
    return row;
  }
  let slug = slugify(name);
  for (let i = 2; await getCategory(db, slug); i++) slug = `${slugify(name)}-${i}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${listingCategories.position}), 0)::int` }).from(listingCategories);
  const [row] = await db.insert(listingCategories).values({ ...values, slug, position: max + 1 }).returning();
  return row;
}
