/**
 * Admin-approved name changes. Customers can't edit their name directly: withdrawals only go to bank accounts whose
 * name (as the bank reports it) matches the customer's name, so a free rename would let someone withdraw to another
 * person's account. They send a request (new name + reason + optional documents); an admin approves (the name
 * changes), rejects with a reason, or asks for more information, which the customer answers with text and photos.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { adminActions, kycFiles, nameChangeRequests, users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";
import { badRequest, notFound } from "./errors";
import { decodeImage } from "./images";
import { alertAdmins } from "./adminAlerts";

const photo = z.string().max(700_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload JPG, PNG or WebP pictures");
const app = () => env().APP_URL.replace(/\/+$/, "");
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";
const OPEN = ["pending", "info_needed"] as ("pending" | "info_needed")[];

export const nameChangeSchema = z.object({
  newName: z.string().trim().min(3, "Enter your full name").max(120),
  reason: z.string().trim().min(5, "Tell us why your name is changing").max(1000),
  photos: z.array(photo).max(4).default([]),
});
export const replySchema = z.object({ reply: z.string().trim().min(2, "Write a short answer").max(1500), photos: z.array(photo).max(4).default([]) });

async function saveFiles(tx: Db, userId: string, refId: string, photos: string[]) {
  for (const p of photos) {
    const img = decodeImage(p);
    await tx.insert(kycFiles).values({ userId, refType: "name_change", refId, kind: "extra", contentType: img.contentType, data: img.data });
  }
}

/* ---------------- customer ---------------- */

export async function myNameChange(db: Db, userId: string) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const [n] = await db.select().from(nameChangeRequests).where(eq(nameChangeRequests.userId, userId)).orderBy(desc(nameChangeRequests.createdAt)).limit(1);
  return {
    name: u.name,
    request: n ? { id: n.id, newName: n.newName, oldName: n.oldName, status: n.status, adminNote: n.adminNote, createdAt: n.createdAt, decidedAt: n.decidedAt } : null,
  };
}

export async function requestNameChange(db: Db, userId: string, input: z.output<typeof nameChangeSchema>) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Account");
  const newName = input.newName.replace(/\s+/g, " ");
  if (newName.toLowerCase() === u.name.toLowerCase()) throw badRequest("That's already your name.");
  const [open] = await db.select({ id: nameChangeRequests.id }).from(nameChangeRequests)
    .where(and(eq(nameChangeRequests.userId, userId), inArray(nameChangeRequests.status, OPEN)));
  if (open) throw badRequest("You already have a name change waiting. Please wait for our team, or cancel it first.");
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(nameChangeRequests).values({ userId, oldName: u.name, newName, reason: input.reason }).returning({ id: nameChangeRequests.id });
    await saveFiles(tx as unknown as Db, userId, r.id, input.photos);
    return r.id;
  });
  alertAdmins(db, `Name change request: ${u.name} → ${newName}`, [
    `${u.name} wants to change their name to “${newName}”.`, `Reason: ${input.reason}`,
    input.photos.length ? `${input.photos.length} document photo(s) attached.` : "No documents attached.",
    "Approve it, reject it, or ask them for more information (for example an ID, affidavit or marriage certificate).",
  ], "/admin/name-changes", { customerId: userId });
  return { id, status: "pending" as const };
}

export async function replyNameChange(db: Db, userId: string, input: z.output<typeof replySchema>) {
  const [r] = await db.select().from(nameChangeRequests).where(and(eq(nameChangeRequests.userId, userId), eq(nameChangeRequests.status, "info_needed")));
  if (!r) throw badRequest("There's no question waiting for your answer.");
  await db.transaction(async (tx) => {
    await saveFiles(tx as unknown as Db, userId, r.id, input.photos);
    await tx.update(nameChangeRequests).set({ status: "pending", customerReply: input.reply }).where(eq(nameChangeRequests.id, r.id));
  });
  alertAdmins(db, "Customer answered your name change question", [
    `Name change: ${r.oldName} → ${r.newName}`, `They replied: “${input.reply.slice(0, 500)}”`,
    ...(input.photos.length ? [`${input.photos.length} photo(s) attached.`] : []),
  ], "/admin/name-changes", { customerId: userId });
  return { status: "pending" as const };
}

export async function cancelNameChange(db: Db, userId: string) {
  const r = await db.update(nameChangeRequests).set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(nameChangeRequests.userId, userId), inArray(nameChangeRequests.status, OPEN))).returning({ id: nameChangeRequests.id });
  if (!r.length) throw badRequest("There's no name change waiting.");
  return { ok: true };
}

/* ---------------- admin ---------------- */

export async function nameChangeQueue(db: Db, status: "open" | "approved" | "rejected") {
  const statuses = status === "open" ? OPEN : [status];
  const rows = await db.select({ r: nameChangeRequests, email: users.email }).from(nameChangeRequests)
    .innerJoin(users, eq(users.id, nameChangeRequests.userId))
    .where(inArray(nameChangeRequests.status, statuses))
    .orderBy(status === "open" ? asc(nameChangeRequests.createdAt) : desc(nameChangeRequests.decidedAt)).limit(100);
  const ids = rows.map((x) => x.r.id);
  const files = ids.length ? await db.select({ id: kycFiles.id, refId: kycFiles.refId }).from(kycFiles)
    .where(and(eq(kycFiles.refType, "name_change"), inArray(kycFiles.refId, ids))).orderBy(asc(kycFiles.createdAt)) : [];
  return rows.map(({ r, email }) => ({
    id: r.id, userId: r.userId, email, oldName: r.oldName, newName: r.newName, reason: r.reason, status: r.status,
    adminNote: r.adminNote, customerReply: r.customerReply, createdAt: r.createdAt, decidedAt: r.decidedAt,
    files: files.filter((f) => f.refId === r.id).map((f) => f.id),
  }));
}

export const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "ask"]),
  note: z.string().trim().max(1500).default(""),
});

export async function decideNameChange(db: Db, adminId: string, input: z.output<typeof decideSchema>) {
  if (input.action !== "approve" && input.note.length < 3) {
    throw badRequest(input.action === "ask" ? "Write what information you need from them." : "Write the reason (the customer will see it).");
  }
  const now = new Date();
  const res = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(nameChangeRequests).where(eq(nameChangeRequests.id, input.id)).for("update");
    if (!r) throw notFound("Name change");
    if (r.status !== "pending" && r.status !== "info_needed") throw badRequest("This one has already been decided.");
    const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "info_needed";
    await tx.update(nameChangeRequests).set({
      status, adminNote: input.note || null, decidedAt: input.action === "ask" ? null : now, decidedBy: adminId,
      ...(input.action === "ask" ? { customerReply: null } : {}),
    }).where(eq(nameChangeRequests.id, r.id));
    if (input.action === "approve") await tx.update(users).set({ name: r.newName }).where(eq(users.id, r.userId));
    await tx.insert(adminActions).values({ adminId, userId: r.userId, action: `name_change_${input.action}`, detail: `${r.oldName} → ${r.newName}${input.note ? ` · ${input.note}` : ""}` });
    const [u] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, r.userId));
    return { ...u, newName: r.newName };
  });
  const [subject, lines] = input.action === "approve"
    ? ["Your name change is approved", [`Your name on Almighty Pumps is now “${res.newName}”.`]]
    : input.action === "reject"
      ? ["About your name change", [`We couldn't approve the change to “${res.newName}”.`, `Reason: ${input.note}`]]
      : ["We need a little more information", [`To approve your name change to “${res.newName}” we need a bit more from you:`, `“${input.note}”`, "Please answer in Settings → Profile (you can add photos)."]];
  void sendNotice([res.email], subject, [`Hi ${first(res.name)},`, ...lines], { href: `${app()}/dashboard#settings`, label: "Open Settings" })
    .catch((e) => console.error("[name-change] email", e));
  return { ok: true };
}

export async function nameChangeFile(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("File");
  const [f] = await db.select({ contentType: kycFiles.contentType, data: kycFiles.data }).from(kycFiles).where(eq(kycFiles.id, id));
  if (!f) throw notFound("File");
  return f;
}
