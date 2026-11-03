import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { pricingOverview, setMinOrderKobo, setRule } from "@/server/pricing";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return pricingOverview(getDb());
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
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.type === "min") return setMinOrderKobo(db, Math.round(input.minOrderNaira * 100));
  return setRule(db, input.platform, input.kind, input.markupPercent === null ? null : Math.round(input.markupPercent * 100));
});
