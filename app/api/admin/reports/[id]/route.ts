import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { closeReport } from "@/server/sellerReports";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["close", "reopen"]), note: z.string().max(1000).optional() });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const admin = await requireAdmin();
  const input = await body(req, schema);
  return closeReport(getDb(), id, admin.id, input.note ?? "", input.action === "reopen");
});
