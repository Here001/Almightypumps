import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { getCheckoutOptions, saveCheckoutOptions } from "@/server/payments";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return getCheckoutOptions(getDb());
});

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, z.object({ bankTransfer: z.boolean(), ussd: z.boolean() }));
  return saveCheckoutOptions(getDb(), input);
});
