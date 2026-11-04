import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { applyPriceHide, previewPriceHide, priceRangesSchema, undoPriceHide } from "@/server/smm";

export const dynamic = "force-dynamic";

/** Turn Boost services off by price (₦ per 1k), once: preview, apply, or undo the last batch. */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), ranges: priceRangesSchema }),
  z.object({ action: z.literal("apply"), ranges: priceRangesSchema }),
  z.object({ action: z.literal("undo") }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "preview") return previewPriceHide(db, input.ranges);
  if (input.action === "apply") return applyPriceHide(db, input.ranges);
  return undoPriceHide(db);
});
