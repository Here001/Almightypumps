import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { browseListings, createListing } from "@/server/market";
import { rateLimit } from "@/server/rateLimit";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort");
  return browseListings(getDb(), {
    category: url.searchParams.get("category") || undefined,
    q: url.searchParams.get("q")?.slice(0, 100) || undefined,
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "new",
    limit: Number(url.searchParams.get("limit") ?? 30),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
});

const schema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  deliveryType: z.string(),
  price: z.union([z.string(), z.number()]).optional().default(""),
  negotiable: z.boolean().optional().default(false),
  guidePrice: z.union([z.string(), z.number()]).optional().nullable(),
  minOffer: z.union([z.string(), z.number()]).optional().nullable(),
  stock: z.coerce.number().int(),
  minQty: z.coerce.number().int().default(1),
  maxQty: z.coerce.number().int().default(1),
  answers: z.record(z.string(), z.string().max(2000)).optional(),
});

/** "" or missing optional prices = none; a fixed-price ad needs a price. */
const opt = (v: string | number | null | undefined) => (v == null || String(v).trim() === "" ? null : nairaToKobo(v));
function prices(i: { negotiable: boolean; price: string | number; guidePrice?: string | number | null; minOffer?: string | number | null }) {
  return i.negotiable
    ? { priceKobo: 0, guidePriceKobo: opt(i.guidePrice), minOfferKobo: opt(i.minOffer) }
    : { priceKobo: opt(i.price) ?? 0, guidePriceKobo: null, minOfferKobo: null };
}

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await assertServiceOn(getDb(), "p2p");
  await rateLimit(getDb(), "listingWrite", user.id);
  const input = await body(req, schema);
  return createListing(getDb(), user.id, { ...input, ...prices(input) });
});
