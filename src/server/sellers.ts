/**
 * Seller applications and verification. Customers apply in Settings; admins approve or
 * reject in /admin/sellers. ID numbers are only ever shown to admins.
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ID_TYPES, NG_BANKS } from "@/core/banks";
import { blockedReasons } from "@/core/listingPolicy";
import type { Db } from "./db";
import { sellerProfiles, users } from "./db/schema";
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
    whatTheySell: z.string().trim().min(5, "Tell us briefly what you'll sell").max(500),
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
  return { sellerStatus: "pending" as const };
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
