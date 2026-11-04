import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { payReferrals, referralConfigSchema, referralOverview, saveReferralConfig, voidReferral } from "@/server/referrals";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return referralOverview(getDb());
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config"), config: referralConfigSchema }),
  z.object({ action: z.literal("void"), id: z.string().uuid(), note: z.string().trim().min(3, "Say why (the customer won't see it).").max(300) }),
  z.object({ action: z.literal("pay") }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "config") return saveReferralConfig(db, input.config);
  if (input.action === "void") return voidReferral(db, input.id, input.note);
  return payReferrals(db);
});
