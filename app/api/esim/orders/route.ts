import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { myEsimOrders, orderSchema, placeEsimOrder } from "@/server/esim";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myEsimOrders(getDb(), user.id);
});

/** Order an eSIM: { priceId, imei, numberMode: "new" } or { …, numberMode: "keep", port: {…} }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, orderSchema);
  return placeEsimOrder(getDb(), user.id, input);
});
