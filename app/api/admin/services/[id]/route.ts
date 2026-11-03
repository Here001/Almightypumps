import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { body, route } from "@/server/http";
import { setServiceFeatured, setServiceHidden } from "@/server/smm";

export const dynamic = "force-dynamic";

const schema = z.union([z.object({ hidden: z.boolean() }), z.object({ featured: z.boolean() })]);

/** Hide/unhide ({hidden}) or star/un-star ({featured}) one service (id = the service number customers see). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const input = await body(req, schema);
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Unknown service.");
  if ("featured" in input) return setServiceFeatured(getDb(), n, input.featured);
  return setServiceHidden(getDb(), n, input.hidden);
});
