import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { getDb } from "@/server/db";
import { changePassword, logoutEverywhere, passwordSchema, profileSchema, requireUser, updateProfile } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("type", [
  profileSchema.extend({ type: z.literal("profile") }),
  passwordSchema.extend({ type: z.literal("password") }),
  z.object({ type: z.literal("logout_all") }),
  z.object({ type: z.literal("alerts"), on: z.boolean() }),
]);

/** My notification settings. */
export const GET = route(async () => {
  const user = await requireUser();
  const [u] = await getDb().select({ notifyOrders: users.notifyOrders }).from(users).where(eq(users.id, user.id));
  return { notifyOrders: u?.notifyOrders ?? true };
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, schema);
  const db = getDb();
  if (input.type === "profile") return updateProfile(db, user.id, input);
  if (input.type === "alerts") {
    await db.update(users).set({ notifyOrders: input.on }).where(eq(users.id, user.id));
    return { notifyOrders: input.on };
  }
  if (input.type === "password") {
    await rateLimit(db, "password", user.id);
    return changePassword(db, user.id, input);
  }
  return logoutEverywhere(db, user.id);
});
