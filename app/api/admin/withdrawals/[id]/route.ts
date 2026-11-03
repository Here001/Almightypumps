import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decideWithdrawal } from "@/server/payments";

const schema = z
  .object({ decision: z.enum(["paid", "rejected"]), note: z.string().trim().max(500).optional() })
  .refine((v) => v.decision !== "rejected" || (v.note && v.note.length >= 3), { message: "Tell the customer why it was rejected.", path: ["note"] });

/** Mark a withdrawal as paid after sending the bank transfer, or reject it to refund the wallet. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const { decision, note } = await body(req, schema);
  return decideWithdrawal(getDb(), id, decision, note);
});
