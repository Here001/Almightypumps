import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { buyGiftCard, giftCatalog } from "@/server/giftCards";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ?country=US&q=amazon → countries + products with Naira prices. */
export const GET = route(async (req: Request) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  return giftCatalog(getDb(), p.get("country") || undefined, p.get("q") || undefined);
});

/** Buy one card: { productId, value, priceKobo } (the price the customer agreed to). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await assertServiceOn(getDb(), "giftcards");
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, z.object({ productId: z.number().int().positive(), value: z.number().positive().max(100_000), priceKobo: z.number().int().positive() }));
  return buyGiftCard(getDb(), user.id, input.productId, input.value, input.priceKobo);
});
