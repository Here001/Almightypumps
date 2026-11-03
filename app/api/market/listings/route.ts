import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { browseListings, createListing } from "@/server/market";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  return browseListings(getDb(), {
    category: url.searchParams.get("category") || undefined,
    limit: Number(url.searchParams.get("limit") ?? 30),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
});

const schema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  deliveryType: z.string(),
  price: z.union([z.string(), z.number()]),
  stock: z.coerce.number().int(),
  minQty: z.coerce.number().int().default(1),
  maxQty: z.coerce.number().int().default(1),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, schema);
  return createListing(getDb(), user.id, { ...input, priceKobo: nairaToKobo(input.price) });
});
