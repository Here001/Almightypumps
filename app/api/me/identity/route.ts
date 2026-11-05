import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import {
  cancelNameChange, identitySchema, myIdentity, nameChangeSchema, replyIdentity, replyNameChange, replySchema, requestNameChange, submitIdentity,
} from "@/server/identity";

export const dynamic = "force-dynamic";

/** My identity check and name change status. */
export const GET = route(async () => {
  const user = await requireUser();
  return myIdentity(getDb(), user.id);
});

const schema = z.discriminatedUnion("action", [
  identitySchema.extend({ action: z.literal("submit") }),
  replySchema.extend({ action: z.literal("reply") }),
  nameChangeSchema.extend({ action: z.literal("name") }),
  replySchema.extend({ action: z.literal("name_reply") }),
  z.object({ action: z.literal("name_cancel") }),
]);

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const db = getDb();
  await rateLimit(db, "identity", user.id);
  const input = await body(req, schema);
  if (input.action === "submit") return submitIdentity(db, user.id, input);
  if (input.action === "reply") return replyIdentity(db, user.id, input);
  if (input.action === "name") return requestNameChange(db, user.id, input);
  if (input.action === "name_reply") return replyNameChange(db, user.id, input);
  return cancelNameChange(db, user.id);
});
