import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { postMessage, tradeForUser } from "@/server/market";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

/** The trade room: trade details, timeline and chat. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  return tradeForUser(getDb(), id, user.id, user.role === "admin");
});

const schema = z.object({ body: z.string() });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  await rateLimit(getDb(), "message", user.id);
  const input = await body(req, schema);
  return postMessage(getDb(), id, user.id, input.body);
});
