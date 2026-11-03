/**
 * Email + password accounts with a signed, httpOnly session cookie.
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { getDb } from "./db";
import { users, wallets } from "./db/schema";
import { env } from "./env";
import { AppError, badRequest, unauthorized } from "./errors";

const COOKIE = "ap_session";
let dummyHash: string | undefined;
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().regex(/^(\+?234|0)[789]\d{9}$/, "Enter a Nigerian phone number, like 0803 123 4567").optional().or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function register(db: Db, input: z.infer<typeof registerSchema>) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists. Log in instead.");
    const [u] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, phone: input.phone || null, passwordHash })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    await tx.insert(wallets).values({ userId: u.id });
    return u;
  });
}

export async function login(db: Db, input: z.infer<typeof loginSchema>) {
  const [u] = await db.select().from(users).where(eq(users.email, input.email));
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  dummyHash ??= await bcrypt.hash("not-a-real-password", 12);
  const ok = await bcrypt.compare(input.password, u && !u.isSystem ? u.passwordHash : dummyHash);
  if (!u || !ok || u.isSystem) throw badRequest("That email and password don't match.");
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export async function startSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export type SessionUser = { id: string; name: string; email: string; role: "user" | "admin"; sellerStatus: string };

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const [u] = await getDb()
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, sellerStatus: users.sellerStatus })
      .from(users)
      .where(eq(users.id, payload.sub));
    return u ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new AppError(403, "FORBIDDEN", "Admins only.");
  return u;
}
