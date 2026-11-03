import { z } from "zod";
import { getDb } from "@/server/db";
import { changePassword, logoutEverywhere, passwordSchema, profileSchema, requireUser, updateProfile } from "@/server/auth";
import { body, route } from "@/server/http";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("type", [
  profileSchema.extend({ type: z.literal("profile") }),
  passwordSchema.extend({ type: z.literal("password") }),
  z.object({ type: z.literal("logout_all") }),
]);

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, schema);
  const db = getDb();
  if (input.type === "profile") return updateProfile(db, user.id, input);
  if (input.type === "password") return changePassword(db, user.id, input);
  return logoutEverywhere(db, user.id);
});
