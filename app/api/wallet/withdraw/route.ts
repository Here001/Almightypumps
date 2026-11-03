import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { myWithdrawals, requestWithdrawal } from "@/server/payments";
import { rateLimit } from "@/server/rateLimit";

const schema = z.object({
  amount: z.union([z.string(), z.number()]),
  bankCode: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "withdraw", user.id);
  const input = await body(req, schema);
  return requestWithdrawal(getDb(), user.id, { ...input, amount: nairaToKobo(input.amount) });
});

export const dynamic = "force-dynamic";

/** My withdrawals and the bank details to pre-fill. */
export const GET = route(async () => {
  const user = await requireUser();
  return myWithdrawals(getDb(), user.id);
});
