import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { setSmsFixedPrice, setSmsServiceHidden, syncSmsServices, updateVerifyConfig, verifyAdminOverview } from "@/server/smsVerify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async () => {
  await requireAdmin();
  return verifyAdminOverview(getDb());
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config"), markupPercent: z.number().min(0).max(1000).optional(), enabled: z.boolean().optional() }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("hide"), names: z.array(z.string()).max(2000), hidden: z.boolean() }),
  // Fixed price in Naira for one app; null removes it (back to the markup).
  z.object({ action: z.literal("price"), name: z.string().min(1), naira: z.number().positive().max(1_000_000).nullable() }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "sync") return syncSmsServices(db);
  if (input.action === "hide") return setSmsServiceHidden(db, input.names, input.hidden);
  if (input.action === "price") return setSmsFixedPrice(db, input.name, input.naira === null ? null : Math.round(input.naira * 100));
  return updateVerifyConfig(db, {
    markupBps: input.markupPercent === undefined ? undefined : Math.round(input.markupPercent * 100),
    enabled: input.enabled,
  });
});
