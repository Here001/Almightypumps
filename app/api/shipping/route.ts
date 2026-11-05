import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { bookShipment, cancelShipment, myShipments, quoteSchema, quoteShipment, shippingInfo, shippingStates } from "@/server/shipping";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Send a Package": availability, Nigerian states and my shipments. */
export const GET = route(async (req: Request) => {
  const me = await requireUser();
  const db = getDb();
  // ?states=GB → that country's states/regions (empty = type it in).
  const cc = new URL(req.url).searchParams.get("states");
  if (cc) return { states: await shippingStates(cc) };
  const [info, list] = await Promise.all([shippingInfo(db), myShipments(db, me.id)]);
  return { ...info, shipments: list };
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), input: quoteSchema }),
  z.object({ action: z.literal("book"), quoteId: z.string().uuid(), rateId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
]);

export const POST = route(async (req: Request) => {
  const me = await requireUser();
  const db = getDb();
  const input = await body(req, schema);
  if (input.action !== "cancel") await assertServiceOn(db, "ship");
  if (input.action === "quote") {
    await rateLimit(db, "shipQuote", me.id);
    return quoteShipment(db, me.id, input.input);
  }
  if (input.action === "book") {
    await rateLimit(db, "shipBook", me.id);
    return bookShipment(db, me.id, input.quoteId, input.rateId);
  }
  return cancelShipment(db, input.id, { userId: me.id });
});
