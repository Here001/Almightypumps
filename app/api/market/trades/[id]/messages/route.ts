import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { postMessage, tradeForUser } from "@/server/market";

export const dynamic = "force-dynamic";

/** The trade room: trade details, timeline and chat. */
export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  return tradeForUser(getDb(), params.id, user.id, user.role === "admin");
});

const schema = z.object({ body: z.string() });

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const input = await body(req, schema);
  return postMessage(getDb(), params.id, user.id, input.body);
});
