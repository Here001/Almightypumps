import { z } from "zod";
import { getDb } from "@/server/db";
import { smmProviders } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return getDb().select().from(smmProviders);
});

const schema = z.object({
  name: z.string().min(2),
  apiUrl: z.string().url(),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/, "Use an env var name like SMM_PROVIDER_2_KEY"),
  currency: z.string().length(3).default("NGN"),
  fxKoboPerUnit: z.coerce.number().int().positive().default(100),
  markupBps: z.coerce.number().int().min(0).max(50_000).default(3000),
});

/** Add an upstream panel. Its API key lives in the env var you name, never in the database. */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const [p] = await getDb().insert(smmProviders).values(input).returning();
  return p;
});
