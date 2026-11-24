import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { answerImeiCheck, imeiChecksForAdmin } from "@/server/imeiChecks";

export const dynamic = "force-dynamic";

/** ?status=pending|done */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  return imeiChecksForAdmin(getDb(), new URL(req.url).searchParams.get("status") === "done" ? "done" : "pending");
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await body(req, z.object({ id: z.string().uuid(), works: z.boolean(), note: z.string().max(500).optional() }));
  return answerImeiCheck(getDb(), input.id, admin.id, input.works, input.note ?? "");
});
