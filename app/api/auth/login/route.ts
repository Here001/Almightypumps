import { getDb } from "@/server/db";
import { login, loginSchema, startSession } from "@/server/auth";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const POST = route(async (req: Request) => {
  const input = await body(req, loginSchema);
  const db = getDb();
  // Slow down password guessing: per network and per account.
  await rateLimit(db, "loginIp", clientIp(req));
  await rateLimit(db, "loginEmail", input.email);
  const user = await login(db, input);
  await startSession(user.id);
  return user;
});
