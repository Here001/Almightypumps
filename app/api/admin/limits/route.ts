import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { readSetting, writeSetting } from "@/server/appSettings";
import { LIMITS, clearLimitCache, limitUsage, type LimitName, type Rule } from "@/server/rateLimit";
import { adminActions } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Every limit with its current value and the last 24 hours of requests / blocks. */
export const GET = route(async () => {
  await requireAdmin();
  return limitUsage(getDb());
});

const schema = z.object({
  rule: z.string().refine((r) => r in LIMITS, "Unknown limit"),
  max: z.number().int().min(1, "The limit must be at least 1").max(10_000_000).optional(),
  reset: z.boolean().optional(),
});

/** Change one limit (or put it back to the default). */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  const name = input.rule as LimitName;
  const cur = await readSetting<Partial<Record<LimitName, Rule>>>(db, "rate_limit_overrides", {});
  if (input.reset || input.max === LIMITS[name].max) delete cur[name];
  else if (input.max) cur[name] = { max: input.max, windowSec: LIMITS[name].windowSec };
  // Replace the whole value (readSetting merges, so write the full object).
  await writeSetting(db, "rate_limit_overrides", cur);
  await db.insert(adminActions).values({ adminId: admin.id, userId: admin.id, action: "limit_change", detail: `${name}: ${input.reset ? "default" : input.max}` });
  clearLimitCache();
  return { ok: true };
});
