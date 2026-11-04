import { getDb } from "@/server/db";
import { register, registerSchema, startSession } from "@/server/auth";
import { emailConfigured, sendCode } from "@/server/emailCodes";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { linkReferral } from "@/server/referrals";

export const dynamic = "force-dynamic";

/** Create an account. With email codes on, the reply is { needsCode, challenge, email } until the code is entered. */
export const POST = route(async (req: Request) => {
  const input = await body(req, registerSchema);
  const db = getDb();
  const ip = clientIp(req);
  await rateLimit(db, "registerIp", ip);
  const codes = emailConfigured();
  const user = await register(db, input, { verified: !codes });
  await linkReferral(db, user.id, input.ref).catch((e) => console.error("[referrals] link", e));
  if (codes) return sendCode(db, user, "signup", true, ip);
  await startSession(user.id, true);
  return user;
});
