import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { cancelNameChange, myNameChange, nameChangeSchema, replyNameChange, replySchema, requestNameChange } from "@/server/nameChanges";

export const dynamic = "force-dynamic";

/** My latest name change request. */
export const GET = route(async () => {
  const user = await requireUser();
  return myNameChange(getDb(), user.id);
});

const schema = z.discriminatedUnion("action", [
  nameChangeSchema.extend({ action: z.literal("request") }),
  replySchema.extend({ action: z.literal("reply") }),
  z.object({ action: z.literal("cancel") }),
]);

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const db = getDb();
  await rateLimit(db, "nameChange", user.id);
  const input = await body(req, schema);
  if (input.action === "request") return requestNameChange(db, user.id, input);
  if (input.action === "reply") return replyNameChange(db, user.id, input);
  return cancelNameChange(db, user.id);
});
