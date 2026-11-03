import { getDb } from "@/server/db";
import { register, registerSchema, startSession } from "@/server/auth";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const POST = route(async (req: Request) => {
  const input = await body(req, registerSchema);
  const db = getDb();
  await rateLimit(db, "registerIp", clientIp(req));
  const user = await register(db, input);
  await startSession(user.id);
  return user;
});
