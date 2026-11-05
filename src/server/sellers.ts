/**
 * Seller applications and verification. Customers apply in Settings; admins approve or
 * reject in /admin/sellers. ID numbers are only ever shown to admins.
 */
import { alertAdmins } from "./adminAlerts";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ID_TYPES, NG_BANKS } from "@/core/banks";
import { blockedReasons } from "@/core/listingPolicy";
import type { Db } from "./db";
import { sellerAvatars, sellerProfiles, users } from "./db/schema";
import { badRequest, notFound } from "./errors";

const phone = z.string().trim().regex(/^(\+?234|0)[789]\d{9}$/, "Enter a Nigerian phone number, like 0803 123 4567");

export const applySchema = z
  .object({
    businessName: z.string().trim().min(2, "Enter your shop or business name").max(80),
    contactPhone: phone,
    bankCode: z.string().refine((c) => NG_BANKS.some((b) => b.code === c), "Choose your bank"),
    accountNumber: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits"),
    accountName: z.string().trim().min(3, "Enter the account name").max(120),
    idType: z.enum(["nin", "drivers_license", "passport", "voters_card"]),
    idNumber: z.string().trim().min(5, "Enter your ID number").max(30),
    whatTheySell: z.string().trim().min(2, "Tell us what you'll sell").max(500),
  })
  .superRefine((v, ctx) => {
    const t = ID_TYPES.find((x) => x.id === v.idType)!;
    if (!t.pattern.test(v.idNumber.replace(/\s/g, ""))) ctx.addIssue({ code: "custom", path: ["idNumber"], message: `That doesn't look like a valid ${t.label} (${t.hint}).` });
  });

const mask = (s: string) => (s.length <= 3 ? "•••" : `${"•".repeat(Math.min(8, s.length - 3))}${s.slice(-3)}`);

export async function applyToSell(db: Db, userId: string, input: z.infer<typeof applySchema>) {
  const [u] = await db.select({ status: users.sellerStatus }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  if (u.status === "verified") throw badRequest("You're already a verified seller.");
  const banned = blockedReasons(`${input.businessName}\n${input.whatTheySell}`);
  if (banned.length) throw badRequest(banned.join(" "));
  const bank = NG_BANKS.find((b) => b.code === input.bankCode)!;
  const values = {
    businessName: input.businessName, contactPhone: input.contactPhone, bankName: bank.name, bankCode: bank.code,
    accountNumber: input.accountNumber, accountName: input.accountName, idType: input.idType,
    idNumber: input.idNumber.replace(/\s/g, "").toUpperCase(), whatTheySell: input.whatTheySell,
    reviewNote: null, submittedAt: new Date(), decidedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx.insert(sellerProfiles).values({ userId, ...values }).onConflictDoUpdate({ target: sellerProfiles.userId, set: values });
    await tx.update(users).set({ sellerStatus: "pending" }).where(eq(users.id, userId));
  });
  alertAdmins(db, `Seller application: ${input.businessName}`, [
    `${input.businessName} wants to sell on the P2P marketplace.`, `What they sell: ${input.whatTheySell}`,
    "Check their ID and bank details, then approve or reject.",
  ], "/admin/sellers", { customerId: userId });
  return { sellerStatus: "pending" as const };
}

/**
 * The seller status to show: "pending" without an application on file (left over from the old
 * one-tap button) is treated as "none" so the person gets the form instead of being stuck.
 */
export async function effectiveSellerStatus(db: Db, userId: string, status: string) {
  if (status !== "pending") return status;
  const [p] = await db.select({ id: sellerProfiles.userId }).from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  return p ? status : "none";
}

/** What the seller sees about their own application (ID and account number masked). */
export async function mySellerProfile(db: Db, userId: string) {
  const [p] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  if (!p) return null;
  return {
    businessName: p.businessName, contactPhone: p.contactPhone, bankName: p.bankName, bankCode: p.bankCode,
    accountName: p.accountName, accountNumberMasked: mask(p.accountNumber), idType: p.idType, idNumberMasked: mask(p.idNumber),
    whatTheySell: p.whatTheySell, reviewNote: p.reviewNote, submittedAt: p.submittedAt,
  };
}

export async function sellerApplications(db: Db, status: "pending" | "verified" | "rejected") {
  return db
    .select({
      userId: users.id, name: users.name, email: users.email, status: users.sellerStatus, joined: users.createdAt,
      businessName: sellerProfiles.businessName, contactPhone: sellerProfiles.contactPhone, bankName: sellerProfiles.bankName,
      accountNumber: sellerProfiles.accountNumber, accountName: sellerProfiles.accountName, idType: sellerProfiles.idType,
      idNumber: sellerProfiles.idNumber, whatTheySell: sellerProfiles.whatTheySell, reviewNote: sellerProfiles.reviewNote,
      submittedAt: sellerProfiles.submittedAt, decidedAt: sellerProfiles.decidedAt,
    })
    .from(users)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(eq(users.sellerStatus, status))
    .orderBy(status === "pending" ? sellerProfiles.submittedAt : desc(sellerProfiles.decidedAt))
    .limit(100);
}

export async function decideSeller(db: Db, userId: string, decision: "verified" | "rejected", note?: string) {
  if (decision === "rejected" && !note?.trim()) throw badRequest("Write a short reason so the applicant knows what to fix.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: sellerProfiles.userId }).from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
    if (!p) throw notFound("Seller application");
    await tx.update(sellerProfiles).set({ reviewNote: decision === "rejected" ? note!.trim().slice(0, 500) : null, decidedAt: new Date() }).where(eq(sellerProfiles.userId, userId));
    const [u] = await tx.update(users).set({ sellerStatus: decision }).where(eq(users.id, userId)).returning({ id: users.id, sellerStatus: users.sellerStatus });
    return u;
  });
}

/* ---------- Shop picture ---------- */

export const AVATAR_TYPES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};
export const AVATAR_MAX_BYTES = 300 * 1024;

/** Save the seller's shop picture from a data URL (the browser has already cropped it to a small square). */
export async function setSellerAvatar(db: Db, userId: string, dataUrl: string) {
  const [p] = await db.select({ id: sellerProfiles.userId }).from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  if (!p) throw badRequest("Apply to become a seller first.");
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest("Upload a JPG, PNG or WebP picture.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > AVATAR_MAX_BYTES) throw badRequest("That picture is too big. Try a smaller one.");
  if (!AVATAR_TYPES[m[1]](data)) throw badRequest("That file isn't a valid picture.");
  const values = { contentType: m[1], data, updatedAt: new Date() };
  await db.insert(sellerAvatars).values({ userId, ...values }).onConflictDoUpdate({ target: sellerAvatars.userId, set: values });
  return { avatarUrl: avatarUrl(userId, values.updatedAt) };
}

export async function removeSellerAvatar(db: Db, userId: string) {
  await db.delete(sellerAvatars).where(eq(sellerAvatars.userId, userId));
  return { avatarUrl: null };
}

export async function sellerAvatarUrl(db: Db, userId: string) {
  const [a] = await db.select({ at: sellerAvatars.updatedAt }).from(sellerAvatars).where(eq(sellerAvatars.userId, userId));
  return a ? avatarUrl(userId, a.at) : null;
}

/** The version in the URL changes on every upload, so browsers can cache each picture forever. */
export function avatarUrl(userId: string, updatedAt: Date | string) {
  return `/api/sellers/${userId}/avatar?v=${new Date(updatedAt).getTime().toString(36)}`;
}

/** The picture bytes, only for sellers who are verified (buyers never see unverified shops). */
export async function sellerAvatarFile(db: Db, userId: string) {
  const [a] = await db
    .select({ contentType: sellerAvatars.contentType, data: sellerAvatars.data, status: users.sellerStatus })
    .from(sellerAvatars)
    .innerJoin(users, eq(users.id, sellerAvatars.userId))
    .where(eq(sellerAvatars.userId, userId));
  return a && a.status === "verified" ? a : null;
}
