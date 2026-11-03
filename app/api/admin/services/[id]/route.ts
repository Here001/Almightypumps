import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { body, route } from "@/server/http";
import { setServiceHidden } from "@/server/smm";

export const dynamic = "force-dynamic";

const schema = z.object({ hidden: z.boolean() });

/** Hide or unhide one service (id = the service number customers see). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const { hidden } = await body(req, schema);
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Unknown service.");
  return setServiceHidden(getDb(), n, hidden);
});
