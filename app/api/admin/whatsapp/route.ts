import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { updateWhatsAppConfig, whatsappAdminOverview } from "@/server/whatsapp";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return whatsappAdminOverview(getDb());
});

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, z.object({
    enabled: z.boolean().optional(), businessNumber: z.string().max(20).optional(),
    dailyBudgetUsd: z.number().min(0).max(500).optional(), graphVersion: z.string().max(8).optional(),
  }));
  return updateWhatsAppConfig(getDb(), input);
});
