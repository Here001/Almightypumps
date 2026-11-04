import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { emailConfigured, maskEmail, sendCode } from "@/server/emailCodes";
import { AppError } from "@/server/errors";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * "Forgot password": email a 6-digit reset code. The reply looks the same whether or not the email has an
 * account, so nobody can use this page to find out who is registered.
 */
export const POST = route(async (req: Request) => {
  const input = await body(req, z.object({ email: z.string().trim().toLowerCase().email("Enter your email address") }));
  const db = getDb();
  const ip = clientIp(req);
  if (!emailConfigured()) throw new AppError(503, "EMAIL_OFF", "Password reset isn't available right now. Email support@almightypumps.com.");
  await rateLimit(db, "loginEmail", input.email);
  const [u] = await db.select({ id: users.id, email: users.email, name: users.name, isSystem: users.isSystem }).from(users).where(eq(users.email, input.email));
  if (!u || u.isSystem) {
    await rateLimit(db, "emailCodeIp", ip);
    return { needsCode: true, challenge: randomUUID(), email: maskEmail(input.email), purpose: "reset" };
  }
  return sendCode(db, u, "reset", false, ip);
});
