/**
 * 6-digit email codes: once at sign-up (proves the email is real) and when logging in on a device we haven't
 * seen before. A device that passed gets an `ap_device` cookie and is trusted for 30 days.
 * Codes expire after 10 minutes, allow 5 wrong tries, and are stored only as an HMAC.
 */
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "./db";
import { emailCodes, trustedDevices, users } from "./db/schema";
import { codeEmail, emailConfigured, sendEmail } from "./email";
import { env } from "./env";
import { AppError, badRequest } from "./errors";
import { rateLimit } from "./rateLimit";

const CODE_TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const DEVICE_COOKIE = "ap_device";
const DEVICE_DAYS = 30;

export { emailConfigured };

const hashCode = (id: string, code: string) => createHmac("sha256", env().SESSION_SECRET).update(`email-code:${id}:${code}`).digest("hex");
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** b•••@gmail.com */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(5, local.length - 1)))}@${domain}`;
}

export type Purpose = "signup" | "login" | "reset";
export type Challenge = { needsCode: true; challenge: string; email: string; purpose: Purpose };

/** Email a fresh code (earlier unused codes for this account stop working). */
export async function sendCode(db: Db, user: { id: string; email: string; name: string }, purpose: Purpose, remember: boolean, ip: string): Promise<Challenge> {
  await rateLimit(db, "emailCodeUser", user.id);
  await rateLimit(db, "emailCodeIp", ip);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = await db.transaction(async (tx) => {
    await tx.update(emailCodes).set({ usedAt: new Date() }).where(and(eq(emailCodes.userId, user.id), isNull(emailCodes.usedAt)));
    const [r] = await tx.insert(emailCodes).values({ userId: user.id, purpose, codeHash: "pending", remember, expiresAt: new Date(Date.now() + CODE_TTL_MS) }).returning({ id: emailCodes.id });
    await tx.update(emailCodes).set({ codeHash: hashCode(r.id, code) }).where(eq(emailCodes.id, r.id));
    return r;
  });
  const m = codeEmail(code, purpose, user.name.split(" ")[0] || "there");
  await sendEmail(user.email, m.subject, m.text, m.html);
  return { needsCode: true, challenge: row.id, email: maskEmail(user.email), purpose };
}

/** Check a code. Right → returns who to sign in; wrong → error with tries left. */
export async function checkCode(db: Db, challengeId: string, code: string, purposes: Purpose[] = ["signup", "login"]) {
  const clean = code.replace(/\D/g, "");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(emailCodes).where(eq(emailCodes.id, challengeId)).for("update");
    if (!c || c.usedAt || !purposes.includes(c.purpose)) throw badRequest("That code has expired. Tap “Send a new code”.");
    if (c.expiresAt.getTime() < Date.now()) throw badRequest("That code has expired. Tap “Send a new code”.");
    if (c.attempts >= MAX_TRIES) throw badRequest("Too many wrong tries. Tap “Send a new code”.");
    const a = Buffer.from(hashCode(c.id, clean)), b = Buffer.from(c.codeHash);
    if (clean.length !== 6 || a.length !== b.length || !timingSafeEqual(a, b)) {
      await tx.update(emailCodes).set({ attempts: c.attempts + 1 }).where(eq(emailCodes.id, c.id));
      const left = MAX_TRIES - c.attempts - 1;
      // Commit the failed attempt even though we report an error.
      return { ok: false as const, left };
    }
    await tx.update(emailCodes).set({ usedAt: new Date() }).where(eq(emailCodes.id, c.id));
    // Any correct code proves the person owns the email.
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, c.userId), isNull(users.emailVerifiedAt)));
    return { ok: true as const, userId: c.userId, remember: c.remember, purpose: c.purpose };
  }).then((r) => {
    if (!r.ok) throw badRequest(r.left > 0 ? `That code isn't right. ${r.left} ${r.left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Tap “Send a new code”.");
    return r;
  });
}

/** "Send a new code" for an earlier challenge. */
export async function resendCode(db: Db, challengeId: string, ip: string) {
  const [c] = await db.select({ userId: emailCodes.userId, purpose: emailCodes.purpose, remember: emailCodes.remember, createdAt: emailCodes.createdAt })
    .from(emailCodes).where(eq(emailCodes.id, challengeId));
  // Unknown challenge (e.g. a "forgot password" for an email with no account): answer like a real one.
  if (!c) return { needsCode: true as const, challenge: randomUUID(), email: "your email", purpose: "reset" as const };
  if (Date.now() - c.createdAt.getTime() < 30_000) throw new AppError(429, "TOO_SOON", "Please wait a few seconds before asking for another code.");
  if (Date.now() - c.createdAt.getTime() > 60 * 60_000) throw badRequest("Please start again: go back and enter your email and password.");
  const [u] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, c.userId));
  if (!u) throw badRequest("Please start again.");
  return sendCode(db, u, c.purpose, c.remember, ip);
}

/* ---------- Trusted devices ---------- */

export async function isTrustedDevice(db: Db, userId: string): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const [d] = await db.select({ id: trustedDevices.id }).from(trustedDevices)
    .where(and(eq(trustedDevices.tokenHash, hashToken(token)), eq(trustedDevices.userId, userId), gt(trustedDevices.expiresAt, new Date())));
  if (!d) return false;
  await db.update(trustedDevices).set({ lastUsedAt: new Date() }).where(eq(trustedDevices.id, d.id));
  return true;
}

export async function trustThisDevice(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DEVICE_DAYS * 86_400_000);
  await db.insert(trustedDevices).values({ userId, tokenHash: hashToken(token), expiresAt });
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DEVICE_DAYS * 86_400 });
  // Housekeeping: drop this account's expired devices.
  await db.delete(trustedDevices).where(and(eq(trustedDevices.userId, userId), sql`${trustedDevices.expiresAt} < now()`));
}

/** Password change / "log out other devices": other devices must enter a code again. */
export async function forgetOtherDevices(db: Db, userId: string) {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  await db.delete(trustedDevices).where(token
    ? and(eq(trustedDevices.userId, userId), ne(trustedDevices.tokenHash, hashToken(token)))
    : eq(trustedDevices.userId, userId));
}
