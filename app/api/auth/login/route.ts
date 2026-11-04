import { getDb } from "@/server/db";
import { login, loginSchema, startSession } from "@/server/auth";
import { emailConfigured, isTrustedDevice, sendCode } from "@/server/emailCodes";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Email + password. Then, with email codes on: an account that never confirmed its email, or a device we
 * haven't seen before, gets a 6-digit code by email instead of a session ({ needsCode, challenge, email }).
 */
export const POST = route(async (req: Request) => {
  const input = await body(req, loginSchema);
  const db = getDb();
  const ip = clientIp(req);
  // Slow down password guessing: per network and per account.
  await rateLimit(db, "loginIp", ip);
  await rateLimit(db, "loginEmail", input.email);
  const { verified, ...user } = await login(db, input);
  if (emailConfigured()) {
    if (!verified) return sendCode(db, user, "signup", input.remember, ip);
    if (!(await isTrustedDevice(db, user.id))) return sendCode(db, user, "login", input.remember, ip);
  }
  await startSession(user.id, input.remember);
  return user;
});
