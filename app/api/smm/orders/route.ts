import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { myOrders, placeOrder } from "@/server/smm";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  service: z.coerce.number().int().positive(),
  link: z.string().min(2).max(500),
  quantity: z.coerce.number().int().positive(),
});

export const GET = route(async () => {
  const user = await requireUser();
  return myOrders(getDb(), user.id);
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "order", user.id);
  const input = await body(req, schema);
  return placeOrder(getDb(), user.id, { servicePublicId: input.service, link: input.link, quantity: input.quantity });
});
