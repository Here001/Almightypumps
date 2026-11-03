import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { body, route } from "@/server/http";
import { setServicesHiddenBulk } from "@/server/smm";

export const dynamic = "force-dynamic";

const schema = z.object({
  hidden: z.boolean(),
  platform: z.string().max(100).optional(),
  kind: z.string().max(50).optional(),
  q: z.string().max(100).optional(),
});

/** Switch every service matching platform / kind / search on or off. */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  if (!input.platform && !input.kind && !(input.q && input.q.trim().length >= 2)) {
    throw badRequest("Pick a platform, a type or a search first, so you don't switch off the whole store by accident.");
  }
  return setServicesHiddenBulk(getDb(), { platform: input.platform || undefined, kind: input.kind || undefined, q: input.q }, input.hidden);
});
