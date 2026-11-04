import { getDb } from "@/server/db";
import { login, loginSchema, startSession } from "@/server/auth";
import { verifyCaptcha } from "@/server/captcha";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const input = await body(req, loginSchema);
  const db = getDb();
  const ip = clientIp(req);
  // Slow down password guessing: per network and per account.
  await rateLimit(db, "loginIp", ip);
  await rateLimit(db, "loginEmail", input.email);
  // Bots stop here: the "I'm not a robot" check must pass before the password is even looked at.
  await verifyCaptcha(input.captcha, ip);
  const user = await login(db, input);
  await startSession(user.id, input.remember);
  return user;
});
