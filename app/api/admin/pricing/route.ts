import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { pricingOverview, refreshUsdRate, setMinOrderKobo, setRule, updateUsdConfig } from "@/server/pricing";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const db = getDb();
  await refreshUsdRate(db); // no-op unless automatic and older than 6 hours
  return pricingOverview(db);
});

const percent = z.coerce.number().min(0, "Markup can't be negative.").max(500, "Markup can't be more than 500%.");
const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rule"),
    platform: z.string().min(1).max(100),
    kind: z.string().min(1).max(50).nullable(),
    markupPercent: z.union([z.null(), percent]), // null removes the rule (checked first: coercion would turn null into 0)
  }),
  z.object({ type: z.literal("min"), minOrderNaira: z.coerce.number().min(0).max(1_000_000) }),
  // Dollar display: automatic (market rate, optional % adjustment) or a manual Naira-per-$1 rate (0 = off).
  z.object({
    type: z.literal("usd"),
    mode: z.enum(["auto", "manual"]).optional(),
    nairaPerDollar: z.coerce.number().min(0).max(100_000).optional(),
    adjustPercent: z.coerce.number().min(-50).max(50).optional(),
  }),
  z.object({ type: z.literal("usd_refresh") }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.type === "min") return setMinOrderKobo(db, Math.round(input.minOrderNaira * 100));
  if (input.type === "usd") {
    return updateUsdConfig(db, {
      mode: input.mode,
      manualKobo: input.nairaPerDollar === undefined ? undefined : Math.round(input.nairaPerDollar * 100),
      adjustBps: input.adjustPercent === undefined ? undefined : Math.round(input.adjustPercent * 100),
    });
  }
  if (input.type === "usd_refresh") return (await refreshUsdRate(db, { force: true })).cfg;
  return setRule(db, input.platform, input.kind, input.markupPercent === null ? null : Math.round(input.markupPercent * 100));
});
