import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { offerAction } from "@/server/offers";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["accept", "decline", "counter", "withdraw", "accept_counter", "decline_counter"]),
  price: z.union([z.string(), z.number()]).optional(),   // counter price per item (₦)
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, schema);
  return offerAction(getDb(), user.id, id, input.action, input.price != null ? nairaToKobo(input.price) : undefined);
});
