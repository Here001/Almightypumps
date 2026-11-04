import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminManualOverview, configSchema, confirmManualDeposit, rejectManualDeposit, saveManualConfig } from "@/server/manualPayments";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return adminManualOverview(getDb());
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config"), config: configSchema }),
  z.object({ action: z.literal("confirm"), id: z.string().uuid(), naira: z.number().positive().max(5_000_000).optional() }),
  z.object({ action: z.literal("reject"), id: z.string().uuid(), reason: z.string().max(500) }),
]);

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "config") return saveManualConfig(db, input.config);
  if (input.action === "confirm") return confirmManualDeposit(db, admin.id, input.id, input.naira === undefined ? undefined : Math.round(input.naira * 100));
  return rejectManualDeposit(db, admin.id, input.id, input.reason);
});
