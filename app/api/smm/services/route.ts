import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { browseServices, serviceCatalog } from "@/server/smm";

export const dynamic = "force-dynamic";

/**
 * GET                                   -> catalogue: platforms with kinds and counts
 * GET ?platform=Instagram&kind=Followers -> one page of services, cheapest first
 *     &q=words  &refill=1  &offset=30
 */
export const GET = route(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  const db = getDb();
  const platform = p.get("platform")?.slice(0, 100) || undefined;
  const q = p.get("q")?.slice(0, 100) || undefined;
  if (!platform && !q) return { platforms: await serviceCatalog(db) };
  return browseServices(db, {
    platform,
    kind: p.get("kind")?.slice(0, 50) || undefined,
    q,
    refillOnly: p.get("refill") === "1",
    offset: Number(p.get("offset") ?? 0) || 0,
  });
});
