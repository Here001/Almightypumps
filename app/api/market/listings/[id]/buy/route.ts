import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { buy } from "@/server/market";
import { rateLimit } from "@/server/rateLimit";

const schema = z.object({ quantity: z.coerce.number().int().positive().default(1) });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  await rateLimit(getDb(), "buy", user.id);
  const { quantity } = await body(req, schema);
  return buy(getDb(), user.id, id, quantity);
});
