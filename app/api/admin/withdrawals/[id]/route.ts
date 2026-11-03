import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decideWithdrawal } from "@/server/payments";

const schema = z.object({ decision: z.enum(["paid", "rejected"]), note: z.string().max(500).optional() });

/** Mark a withdrawal as paid after sending the bank transfer, or reject it to refund the wallet. */
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { decision, note } = await body(req, schema);
  return decideWithdrawal(getDb(), params.id, decision, note);
});
