import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { bvnSchema, checkMyTransfers, createOnetimeAccount, createPermanentAccount, myBankTransfer } from "@/server/bankTransfer";

export const dynamic = "force-dynamic";

/** The customer's automatic bank-transfer account numbers. */
export const GET = route(async () => {
  const me = await requireUser();
  return myBankTransfer(getDb(), me.id);
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("onetime"), amount: z.union([z.string(), z.number()]) }),
  z.object({ action: z.literal("permanent"), bvn: bvnSchema, consent: z.literal(true, { message: "Tick the box to agree." }) }),
  z.object({ action: z.literal("check") }),
]);

export const POST = route(async (req: Request) => {
  const me = await requireUser();
  const db = getDb();
  const input = await body(req, schema);
  if (input.action === "check") {
    await rateLimit(db, "bankCheck", me.id);
    return checkMyTransfers(db, me.id);
  }
  await rateLimit(db, "bankAccount", me.id);
  if (input.action === "onetime") return createOnetimeAccount(db, me.id, nairaToKobo(input.amount));
  return createPermanentAccount(db, me.id, input.bvn);
});
