import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { buy } from "@/server/market";

const schema = z.object({ quantity: z.coerce.number().int().positive().default(1) });

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { quantity } = await body(req, schema);
  return buy(getDb(), user.id, params.id, quantity);
});
