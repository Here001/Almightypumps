import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { buyProduct } from "@/server/shop";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({ product: z.coerce.number().int().positive(), input: z.string().max(500).optional() });

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "buy", user.id);
  const { product, input } = await body(req, schema);
  return buyProduct(getDb(), user.id, product, input);
});
