import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { bankTransferOverview, saveBankTransferConfig } from "@/server/bankTransfer";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return bankTransferOverview(getDb());
});

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, z.object({ enabled: z.boolean(), permanent: z.boolean() }));
  return saveBankTransferConfig(getDb(), input);
});
