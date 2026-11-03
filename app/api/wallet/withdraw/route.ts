import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { requestWithdrawal } from "@/server/payments";

const schema = z.object({
  amount: z.union([z.string(), z.number()]),
  bankCode: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, schema);
  return requestWithdrawal(getDb(), user.id, { ...input, amount: nairaToKobo(input.amount) });
});
