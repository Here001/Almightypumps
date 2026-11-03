import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decideSeller } from "@/server/sellers";

export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["verified", "rejected"]), note: z.string().max(500).optional() });

/** Approve or reject a seller application (a reason is required to reject). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const { decision, note } = await body(req, schema);
  return decideSeller(getDb(), id, decision, note);
});
