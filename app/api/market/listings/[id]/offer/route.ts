import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { makeOffer } from "@/server/offers";
import { rateLimit } from "@/server/rateLimit";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";

const schema = z.object({
  price: z.union([z.string(), z.number()]),          // ₦ per item
  quantity: z.coerce.number().int().positive().default(1),
  note: z.string().max(300).optional(),
});

/** Make an offer on a negotiable ad. The total is held from the wallet until the seller answers. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  await assertServiceOn(getDb(), "p2p");
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, schema);
  return makeOffer(getDb(), user.id, id, { unitPriceKobo: nairaToKobo(input.price), quantity: input.quantity, note: input.note });
});
