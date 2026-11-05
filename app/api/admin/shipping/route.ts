import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { cancelShipment, saveShippingConfig, shippingConfigSchema, shippingOverview, sweepShipments } from "@/server/shipping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async () => {
  await requireAdmin();
  return shippingOverview(getDb());
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config"), config: shippingConfigSchema }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
  z.object({ action: z.literal("refresh") }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const db = getDb();
  const input = await body(req, schema);
  if (input.action === "config") return saveShippingConfig(db, input.config);
  if (input.action === "cancel") return cancelShipment(db, input.id, { admin: true });
  return sweepShipments(db);
});
