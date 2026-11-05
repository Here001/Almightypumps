import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { customerSend, hasUnreadReply, myConversation } from "@/server/support";

export const dynamic = "force-dynamic";

/** My support chat. ?peek=1 → just whether there's an unread reply (for the bubble's dot). */
export const GET = route(async (req: Request) => {
  const me = await requireUser();
  const db = getDb();
  if (new URL(req.url).searchParams.get("peek")) return { unread: await hasUnreadReply(db, me.id) };
  return myConversation(db, me.id);
});

export const POST = route(async (req: Request) => {
  const me = await requireUser();
  const db = getDb();
  await rateLimit(db, "support", me.id);
  const input = await body(req, z.object({ body: z.string().max(4000) }));
  return customerSend(db, me.id, input.body);
});
