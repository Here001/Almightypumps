import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { act } from "@/server/market";

// System and admin-only actions are not accepted here.
const schema = z.object({
  action: z.enum(["SHIP", "CONFIRM", "DISPUTE", "CANCEL"]),
  note: z.string().max(2000).optional(),
  deliveryProof: z.string().max(2000).optional(),
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  const input = await body(req, schema);
  return act(getDb(), id, input.action, { userId: user.id }, { note: input.note, deliveryProof: input.deliveryProof });
});
