import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { badRequest } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
import { giftQuote } from "@/server/giftCards";

export const dynamic = "force-dynamic";

/** ?productId=1&value=25 → exact Naira price for that card value. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "verifyQuote", user.id);
  const p = new URL(req.url).searchParams;
  const productId = Number(p.get("productId")), value = Number(p.get("value"));
  if (!Number.isInteger(productId) || !(value > 0)) throw badRequest("Choose a card and an amount.");
  const q = await giftQuote(getDb(), productId, value);
  return { productId, value, priceKobo: q.priceKobo, redeem: q.redeem };
});
