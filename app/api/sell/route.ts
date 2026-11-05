import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { sellOverview, submitSchema, submitTradeIn } from "@/server/sellDesk";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";

/** Cards and coins we buy (with rates) + the customer's recent trades. */
export const GET = route(async () => {
  const user = await requireUser();
  return sellOverview(getDb(), user.id);
});

/** Sell a gift card or crypto: goes to the admin review queue. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await assertServiceOn(getDb(), "sell");
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, submitSchema);
  return submitTradeIn(getDb(), user, input);
});
