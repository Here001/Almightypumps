/**
 * Identity checks (needed before a customer can withdraw) and admin-approved name changes.
 *
 * Identity: the customer sends an ID type + number, the name exactly as on the ID (must match their profile name) and
 * photos (ID front, optional back, selfie holding the ID). An admin verifies, rejects (with a reason) or asks for more
 * information; the customer can reply with text and extra photos. ID numbers are stored encrypted; an HMAC lets us warn
 * the admin when one ID is used on several accounts.
 *
 * Name changes: customers can't edit their name directly any more. They send a request (new name + reason + optional
 * documents); an admin approves (the name changes), rejects, or asks for more information.
 */
import { createHmac } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { IDENTITY_ID_TYPES, namesMatch } from "@/core/identity";
import type { Db } from "./db";
import { adminActions, identityChecks, kycFiles, nameChangeRequests, users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { decodeImage } from "./images";
import { seal, open as unseal } from "./secretBox";
import { alertAdmins } from "./adminAlerts";

const photo = z.string().max(700_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload JPG, PNG or WebP pictures");
const app = () => env().APP_URL.replace(/\/+$/, "");
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

export const identitySchema = z.object({
  idType: z.enum(IDENTITY_ID_TYPES.map((t) => t.id) as [string, ...string[]]),
  idNumber: z.string().trim().min(5).max(30),
  nameOnId: z.string().trim().min(3, "Enter your name exactly as it is on the ID").max(120),
  front: photo,
  back: photo.optional(),
  selfie: photo,
});
export const replySchema = z.object({ reply: z.string().trim().min(2, "Write a short answer").max(1500), photos: z.array(photo).max(4).default([]) });
export const nameChangeSchema = z.object({
  newName: z.string().trim().min(3, "Enter your full name").max(120),
  reason: z.string().trim().min(5, "Tell us why your name is changing").max(1000),
  photos: z.array(photo).max(4).default([]),
});

const idHash = (type: string, num: string) => createHmac("sha256", env().SESSION_SECRET).update(`id:${type}:${num.toUpperCase()}`).digest("base64url").slice(0, 32);

async function saveFiles(tx: Db, userId: string, refType: "identity" | "name_change", refId: string, files: { kind: "id_front" | "id_back" | "selfie" | "extra"; dataUrl: string }[]) {
  for (const f of files) {
    const img = decodeImage(f.dataUrl);
    await tx.insert(kycFiles).values({ userId, refType, refId, kind: f.kind, contentType: img.contentType, data: img.data });
  }
}

async function profile(db: Db, userId: string) {
  const [u] = await db.select({ name: users.name, email: users.email, identityStatus: users.identityStatus }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  return u;
}

/* ---------------- customer ---------------- */

export async function myIdentity(db: Db, userId: string) {
  const u = await profile(db, userId);
  const [c] = await db.select().from(identityChecks).where(eq(identityChecks.userId, userId));
  const [n] = await db.select().from(nameChangeRequests).where(eq(nameChangeRequests.userId, userId)).orderBy(desc(nameChangeRequests.createdAt)).limit(1);
  return {
    name: u.name,
    status: u.identityStatus,
    check: c ? { idType: c.idType, last4: c.idLast4, nameOnId: c.nameOnId, adminNote: c.adminNote, customerReply: c.customerReply, submittedAt: c.submittedAt, decidedAt: c.decidedAt } : null,
    nameChange: n ? { id: n.id, newName: n.newName, oldName: n.oldName, status: n.status, adminNote: n.adminNote, customerReply: n.customerReply, createdAt: n.createdAt, decidedAt: n.decidedAt } : null,
  };
}

export async function submitIdentity(db: Db, userId: string, input: z.output<typeof identitySchema>) {
  const u = await profile(db, userId);
  if (u.identityStatus === "verified") throw badRequest("Your identity is already verified.");
  const type = IDENTITY_ID_TYPES.find((t) => t.id === input.idType)!;
  const num = input.idNumber.replace(/\s/g, "").toUpperCase();
  if (!type.pattern.test(num)) throw badRequest(`That doesn't look like a valid ${type.label} number (${type.hint}).`);
  if (!namesMatch(input.nameOnId, u.name)) {
    throw badRequest(`The name on your ID must match your profile name (${u.name}). If your name has changed, send a name change request first.`);
  }
  const values = {
    idType: input.idType, idNumberEnc: seal(num), idLast4: num.slice(-4), idHash: idHash(input.idType, num), nameOnId: input.nameOnId,
    status: "pending" as const, adminNote: null, customerReply: null, submittedAt: new Date(), decidedAt: null, decidedBy: null,
  };
  const checkId = await db.transaction(async (tx) => {
    const [c] = await tx.insert(identityChecks).values({ userId, ...values })
      .onConflictDoUpdate({ target: identityChecks.userId, set: values }).returning({ id: identityChecks.id });
    await tx.delete(kycFiles).where(and(eq(kycFiles.refType, "identity"), eq(kycFiles.refId, c.id)));
    await saveFiles(tx as unknown as Db, userId, "identity", c.id, [
      { kind: "id_front", dataUrl: input.front }, ...(input.back ? [{ kind: "id_back" as const, dataUrl: input.back }] : []), { kind: "selfie", dataUrl: input.selfie },
    ]);
    await tx.update(users).set({ identityStatus: "pending" }).where(eq(users.id, userId));
    return c.id;
  });
  alertAdmins(db, `Identity check to review: ${u.name}`, [
    `${u.name} sent their ${type.label} to verify their identity (needed before they can withdraw).`,
    "Check that the photos are clear, the selfie matches the ID, and the name on the ID matches their profile.",
  ], "/admin/identity", { customerId: userId });
  return { status: "pending" as const, id: checkId };
}

export async function replyIdentity(db: Db, userId: string, input: z.output<typeof replySchema>) {
  const [c] = await db.select().from(identityChecks).where(eq(identityChecks.userId, userId));
  if (!c || c.status !== "info_needed") throw badRequest("There's no question waiting for your answer.");
  await db.transaction(async (tx) => {
    await saveFiles(tx as unknown as Db, userId, "identity", c.id, input.photos.map((d) => ({ kind: "extra" as const, dataUrl: d })));
    await tx.update(identityChecks).set({ status: "pending", customerReply: input.reply }).where(eq(identityChecks.id, c.id));
    await tx.update(users).set({ identityStatus: "pending" }).where(eq(users.id, userId));
  });
  alertAdmins(db, "Customer answered your identity question", [`They replied: “${input.reply.slice(0, 500)}”`, input.photos.length ? `${input.photos.length} extra photo(s) attached.` : ""].filter(Boolean),
    "/admin/identity", { customerId: userId });
  return { status: "pending" as const };
}

export async function requestNameChange(db: Db, userId: string, input: z.output<typeof nameChangeSchema>) {
  const u = await profile(db, userId);
  if (input.newName.replace(/\s+/g, " ").toLowerCase() === u.name.toLowerCase()) throw badRequest("That's already your name.");
  const [open] = await db.select({ id: nameChangeRequests.id }).from(nameChangeRequests)
    .where(and(eq(nameChangeRequests.userId, userId), inArray(nameChangeRequests.status, ["pending", "info_needed"])));
  if (open) throw badRequest("You already have a name change waiting. Please wait for our team, or cancel it first.");
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(nameChangeRequests).values({ userId, oldName: u.name, newName: input.newName.replace(/\s+/g, " "), reason: input.reason })
      .returning({ id: nameChangeRequests.id });
    await saveFiles(tx as unknown as Db, userId, "name_change", r.id, input.photos.map((d) => ({ kind: "extra" as const, dataUrl: d })));
    return r.id;
  });
  alertAdmins(db, `Name change request: ${u.name} → ${input.newName}`, [
    `${u.name} wants to change their name to “${input.newName}”.`, `Reason: ${input.reason}`,
    "Approve it, reject it, or ask them for more information (for example an ID, affidavit or marriage certificate).",
  ], "/admin/identity?tab=names", { customerId: userId });
  return { id, status: "pending" as const };
}

export async function replyNameChange(db: Db, userId: string, input: z.output<typeof replySchema>) {
  const [r] = await db.select().from(nameChangeRequests).where(and(eq(nameChangeRequests.userId, userId), eq(nameChangeRequests.status, "info_needed")));
  if (!r) throw badRequest("There's no question waiting for your answer.");
  await db.transaction(async (tx) => {
    await saveFiles(tx as unknown as Db, userId, "name_change", r.id, input.photos.map((d) => ({ kind: "extra" as const, dataUrl: d })));
    await tx.update(nameChangeRequests).set({ status: "pending", customerReply: input.reply }).where(eq(nameChangeRequests.id, r.id));
  });
  alertAdmins(db, "Customer answered your name change question", [`Name change: ${r.oldName} → ${r.newName}`, `They replied: “${input.reply.slice(0, 500)}”`],
    "/admin/identity?tab=names", { customerId: userId });
  return { status: "pending" as const };
}

export async function cancelNameChange(db: Db, userId: string) {
  const r = await db.update(nameChangeRequests).set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(nameChangeRequests.userId, userId), inArray(nameChangeRequests.status, ["pending", "info_needed"]))).returning({ id: nameChangeRequests.id });
  if (!r.length) throw badRequest("There's no name change waiting.");
  return { ok: true };
}

/** Withdrawals call this first. */
export async function assertIdentityVerified(db: Db, userId: string) {
  const u = await profile(db, userId);
  if (u.identityStatus !== "verified") {
    const msg = u.identityStatus === "pending" ? "We're still checking your identity. You can withdraw as soon as it's approved (we'll email you)."
      : u.identityStatus === "info_needed" ? "We need a little more information to verify your identity. Please answer our question in Settings → Identity check."
      : "Please verify your identity before your first withdrawal (Settings → Identity check). It only takes a minute.";
    throw new AppError(403, "IDENTITY_REQUIRED", msg);
  }
  return u;
}

/* ---------------- admin ---------------- */

type Who = { name: string; email: string };
const fileIds = async (db: Db, refType: "identity" | "name_change", ids: string[]) => {
  if (!ids.length) return new Map<string, { id: string; kind: string }[]>();
  const rows = await db.select({ id: kycFiles.id, refId: kycFiles.refId, kind: kycFiles.kind }).from(kycFiles)
    .where(and(eq(kycFiles.refType, refType), inArray(kycFiles.refId, ids))).orderBy(asc(kycFiles.createdAt));
  const m = new Map<string, { id: string; kind: string }[]>();
  for (const r of rows) m.set(r.refId, [...(m.get(r.refId) ?? []), { id: r.id, kind: r.kind }]);
  return m;
};

export async function identityQueue(db: Db, status: "open" | "verified" | "rejected") {
  const statuses = status === "open" ? (["pending", "info_needed"] as const) : ([status] as const);
  const rows = await db.select({ c: identityChecks, name: users.name, email: users.email, createdAt: users.createdAt }).from(identityChecks)
    .innerJoin(users, eq(users.id, identityChecks.userId))
    .where(inArray(identityChecks.status, [...statuses])).orderBy(status === "open" ? asc(identityChecks.submittedAt) : desc(identityChecks.decidedAt)).limit(100);
  const files = await fileIds(db, "identity", rows.map((r) => r.c.id));
  const dupes = rows.length ? await db.select({ hash: identityChecks.idHash, n: sql<number>`count(*)::int` }).from(identityChecks)
    .where(inArray(identityChecks.idHash, rows.map((r) => r.c.idHash))).groupBy(identityChecks.idHash) : [];
  const dupeMap = new Map(dupes.map((d) => [d.hash, d.n]));
  return rows.map((r) => {
    const t = IDENTITY_ID_TYPES.find((x) => x.id === r.c.idType);
    return {
      id: r.c.id, userId: r.c.userId, name: r.name, email: r.email, accountCreated: r.createdAt,
      idType: t?.label ?? r.c.idType, idNumber: unseal(r.c.idNumberEnc), nameOnId: r.c.nameOnId, nameMatches: namesMatch(r.c.nameOnId, r.name),
      status: r.c.status, adminNote: r.c.adminNote, customerReply: r.c.customerReply, submittedAt: r.c.submittedAt, decidedAt: r.c.decidedAt,
      otherAccountsWithSameId: Math.max(0, (dupeMap.get(r.c.idHash) ?? 1) - 1),
      files: files.get(r.c.id) ?? [],
    };
  });
}

export async function nameChangeQueue(db: Db, status: "open" | "approved" | "rejected") {
  const statuses = status === "open" ? (["pending", "info_needed"] as const) : ([status] as const);
  const rows = await db.select({ r: nameChangeRequests, email: users.email, identityStatus: users.identityStatus }).from(nameChangeRequests)
    .innerJoin(users, eq(users.id, nameChangeRequests.userId))
    .where(inArray(nameChangeRequests.status, [...statuses])).orderBy(status === "open" ? asc(nameChangeRequests.createdAt) : desc(nameChangeRequests.decidedAt)).limit(100);
  const files = await fileIds(db, "name_change", rows.map((x) => x.r.id));
  return rows.map(({ r, email, identityStatus }) => ({
    id: r.id, userId: r.userId, email, oldName: r.oldName, newName: r.newName, reason: r.reason, status: r.status,
    adminNote: r.adminNote, customerReply: r.customerReply, createdAt: r.createdAt, decidedAt: r.decidedAt, identityStatus,
    files: files.get(r.id) ?? [],
  }));
}

export const decideSchema = z.object({
  kind: z.enum(["identity", "name"]),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "ask"]),
  note: z.string().trim().max(1500).default(""),
});

export async function decide(db: Db, adminId: string, input: z.output<typeof decideSchema>) {
  if (input.action !== "approve" && input.note.length < 3) {
    throw badRequest(input.action === "ask" ? "Write what information you need from them." : "Write the reason (the customer will see it).");
  }
  const now = new Date();
  let who: Who & { userId: string };
  let subject: string, lines: string[];
  if (input.kind === "identity") {
    const res = await db.transaction(async (tx) => {
      const [c] = await tx.select().from(identityChecks).where(eq(identityChecks.id, input.id)).for("update");
      if (!c) throw notFound("Identity check");
      if (c.status !== "pending" && c.status !== "info_needed") throw badRequest("This one has already been decided.");
      const status = input.action === "approve" ? "verified" : input.action === "reject" ? "rejected" : "info_needed";
      await tx.update(identityChecks).set({
        status, adminNote: input.action === "approve" ? null : input.note, decidedAt: input.action === "ask" ? null : now, decidedBy: adminId,
        ...(input.action === "ask" ? { customerReply: null } : {}),
      }).where(eq(identityChecks.id, c.id));
      await tx.update(users).set({ identityStatus: status, identityVerifiedAt: status === "verified" ? now : null }).where(eq(users.id, c.userId));
      await tx.insert(adminActions).values({ adminId, userId: c.userId, action: `identity_${input.action}`, detail: input.note || null });
      const [u] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, c.userId));
      return { ...u, userId: c.userId };
    });
    who = res;
    if (input.action === "approve") { subject = "Your identity is verified"; lines = ["Thanks! Your identity check is approved, so you can now withdraw to a bank account in your name."]; }
    else if (input.action === "reject") { subject = "About your identity check"; lines = ["We couldn't approve your identity check.", `Reason: ${input.note}`, "You can send it again from Settings → Identity check."]; }
    else { subject = "We need a little more information"; lines = ["To finish your identity check we need a bit more from you:", `“${input.note}”`, "Please answer in Settings → Identity check (you can add photos)."]; }
  } else {
    const res = await db.transaction(async (tx) => {
      const [r] = await tx.select().from(nameChangeRequests).where(eq(nameChangeRequests.id, input.id)).for("update");
      if (!r) throw notFound("Name change");
      if (r.status !== "pending" && r.status !== "info_needed") throw badRequest("This one has already been decided.");
      const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "info_needed";
      await tx.update(nameChangeRequests).set({
        status, adminNote: input.action === "approve" ? (input.note || null) : input.note, decidedAt: input.action === "ask" ? null : now, decidedBy: adminId,
        ...(input.action === "ask" ? { customerReply: null } : {}),
      }).where(eq(nameChangeRequests.id, r.id));
      if (input.action === "approve") await tx.update(users).set({ name: r.newName }).where(eq(users.id, r.userId));
      await tx.insert(adminActions).values({ adminId, userId: r.userId, action: `name_change_${input.action}`, detail: `${r.oldName} → ${r.newName}${input.note ? ` · ${input.note}` : ""}` });
      const [u] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, r.userId));
      return { ...u, userId: r.userId, newName: r.newName };
    });
    who = res;
    if (input.action === "approve") { subject = "Your name change is approved"; lines = [`Your name on Almighty Pumps is now “${res.newName}”.`]; }
    else if (input.action === "reject") { subject = "About your name change"; lines = [`We couldn't approve the change to “${res.newName}”.`, `Reason: ${input.note}`]; }
    else { subject = "We need a little more information"; lines = [`To approve your name change to “${res.newName}” we need a bit more from you:`, `“${input.note}”`, "Please answer in Settings → Profile (you can add photos)."]; }
  }
  void sendNotice([who.email], subject, [`Hi ${first(who.name)},`, ...lines], { href: `${app()}/dashboard#settings`, label: "Open Settings" })
    .catch((e) => console.error("[identity] email", e));
  return { ok: true };
}

export async function kycFile(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("File");
  const [f] = await db.select({ contentType: kycFiles.contentType, data: kycFiles.data }).from(kycFiles).where(eq(kycFiles.id, id));
  if (!f) throw notFound("File");
  return f;
}

