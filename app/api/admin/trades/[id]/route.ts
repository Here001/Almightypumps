import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { act } from "@/server/market";

const schema = z.object({ action: z.enum(["RESOLVE_BUYER", "RESOLVE_SELLER", "CANCEL"]), note: z.string().max(2000).optional() });

/** Dispute team decisions. */
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const { action, note } = await body(req, schema);
  return act(getDb(), params.id, action, { userId: admin.id, isAdmin: true }, { note });
});
