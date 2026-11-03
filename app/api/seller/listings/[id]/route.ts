import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { forbidden } from "@/server/errors";
import { body, route } from "@/server/http";
import { setListingStatus, updateListing } from "@/server/market";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    title: z.string(), description: z.string(), category: z.string(), deliveryType: z.string(),
    price: z.union([z.string(), z.number()]), stock: z.coerce.number().int(),
    minQty: z.coerce.number().int().default(1), maxQty: z.coerce.number().int().default(1),
    answers: z.record(z.string(), z.string().max(2000)).optional(),
  }),
  z.object({ action: z.enum(["pause", "resume", "remove"]) }),
]);

/** Edit, pause, resume or remove one of your ads. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  if (user.sellerStatus !== "verified") throw forbidden("Only verified sellers can manage ads.");
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "update") {
    const { action: _a, price, ...rest } = input;
    return updateListing(db, user.id, id, { ...rest, priceKobo: nairaToKobo(price) });
  }
  return setListingStatus(db, user.id, id, input.action);
});
