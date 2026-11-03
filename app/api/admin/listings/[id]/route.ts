import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { reviewListing } from "@/server/market";

export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["approve", "decline"]), note: z.string().max(500).optional() });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const { decision, note } = await body(req, schema);
  return reviewListing(getDb(), id, decision, note);
});
