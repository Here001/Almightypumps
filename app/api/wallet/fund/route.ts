import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { startFunding } from "@/server/payments";

const schema = z.object({ amount: z.union([z.string(), z.number()]) });

/** Start a Flutterwave checkout. The client redirects to authorizationUrl. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { amount } = await body(req, schema);
  return startFunding(getDb(), user.id, nairaToKobo(amount));
});
