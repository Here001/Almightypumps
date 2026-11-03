import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { findServices, listCategories } from "@/server/smm";

export const dynamic = "force-dynamic";

/**
 * GET                       -> categories with counts
 * GET ?category=Instagram   -> services in that category (cheapest first)
 * GET ?q=instagram+followers -> services matching every word, across categories
 */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const category = url.searchParams.get("category")?.slice(0, 200) || undefined;
  const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const db = getDb();
  if (!category && !q) return { categories: await listCategories(db) };
  return { services: await findServices(db, { category, q }) };
});
