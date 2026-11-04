import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminEsimOrders, adminPlans, deliverEsim, deliverSchema, planSchema, refundEsim, savePlan } from "@/server/esim";

export const dynamic = "force-dynamic";

/** ?view=plans | orders&status=pending|delivered|refunded */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  if (p.get("view") === "orders") {
    const s = p.get("status");
    return adminEsimOrders(getDb(), s === "delivered" || s === "refunded" ? s : "pending");
  }
  return adminPlans(getDb());
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("savePlan"), plan: planSchema }),
  z.object({ action: z.literal("deliver"), id: z.string().uuid(), delivery: deliverSchema }),
  z.object({ action: z.literal("refund"), id: z.string().uuid(), reason: z.string().max(500) }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "savePlan") return savePlan(db, input.plan);
  if (input.action === "deliver") return deliverEsim(db, input.id, input.delivery);
  return refundEsim(db, input.id, input.reason);
});
