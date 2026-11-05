import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminConversation, adminReply, setThreadStatus } from "@/server/support";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  return adminConversation(getDb(), id);
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().max(4000) }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
]);

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const input = await body(req, schema);
  const db = getDb();
  if (input.action === "reply") return adminReply(db, admin.id, id, input.body);
  return setThreadStatus(db, id, input.action === "close" ? "closed" : "open");
});
