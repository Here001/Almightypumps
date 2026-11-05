/**
 * eSIMs sold by hand. The admin sets up plans (data size × months → price). A customer orders with their
 * phone's IMEI and either a new number or a number to keep (port-in); the money is held. The admin buys
 * the eSIM from the supplier and delivers the US number + activation code (or QR picture): the hold is
 * captured. Or the admin refunds with a reason: the hold is released.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { buildLpa, checkImei, formatUs, monthsLabel, usNumber } from "@/core/esim";
import type { Db } from "./db";
import { esimOrders, esimPlans, esimPrices, users } from "./db/schema";
import { badRequest, notFound } from "./errors";
import { open, seal } from "./secretBox";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";
import { alertCustomer, alertNaira } from "./customerAlerts";

/* ---------- Plans (admin) ---------- */

export const planSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give the plan a name").max(60),
  network: z.string().trim().max(60).default(""),
  description: z.string().trim().max(600).default(""),
  allowKeepNumber: z.boolean().default(true),
  keepNumberFeeNaira: z.coerce.number().min(0).max(1_000_000).default(0),
  active: z.boolean().default(true),
  prices: z.array(z.object({
    dataLabel: z.string().trim().min(1, "Enter the data size, e.g. 3GB").max(20),
    months: z.coerce.number().int().min(1).max(24),
    priceNaira: z.coerce.number().positive("Enter a price").max(10_000_000),
    active: z.boolean().default(true),
  })).max(80).default([]),
});

export async function savePlan(db: Db, input: z.output<typeof planSchema>) {
  const keys = new Set<string>();
  for (const p of input.prices) {
    const k = `${p.dataLabel.toUpperCase()}|${p.months}`;
    if (keys.has(k)) throw badRequest(`${p.dataLabel} for ${monthsLabel(p.months)} is listed twice.`);
    keys.add(k);
  }
  return db.transaction(async (tx) => {
    const values = {
      name: input.name, network: input.network, description: input.description, allowKeepNumber: input.allowKeepNumber,
      keepNumberFee: Math.round(input.keepNumberFeeNaira * 100), active: input.active,
    };
    let id = input.id;
    if (id) {
      const [u] = await tx.update(esimPlans).set(values).where(eq(esimPlans.id, id)).returning({ id: esimPlans.id });
      if (!u) throw notFound("Plan");
    } else {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${esimPlans.position}), 0)::int` }).from(esimPlans);
      const [c] = await tx.insert(esimPlans).values({ ...values, position: max + 1 }).returning({ id: esimPlans.id });
      id = c.id;
    }
    // Replace the price grid (orders keep their own copy of what was bought).
    await tx.delete(esimPrices).where(eq(esimPrices.planId, id));
    if (input.prices.length) {
      await tx.insert(esimPrices).values(input.prices.map((p) => ({
        planId: id!, dataLabel: p.dataLabel, months: p.months, price: Math.round(p.priceNaira * 100), active: p.active,
      })));
    }
    return { id };
  });
}

export async function adminPlans(db: Db) {
  const plans = await db.select().from(esimPlans).orderBy(asc(esimPlans.position));
  const prices = plans.length ? await db.select().from(esimPrices).where(inArray(esimPrices.planId, plans.map((p) => p.id))) : [];
  const [counts] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
  }).from(esimOrders);
  return {
    pendingOrders: counts.pending,
    plans: plans.map((p) => ({
      ...p,
      prices: prices.filter((x) => x.planId === p.id).sort((a, b) => a.months - b.months || dataRank(a.dataLabel) - dataRank(b.dataLabel)),
    })),
  };
}

/** Sort "1GB" < "3GB" < "10GB" < "Unlimited". */
function dataRank(label: string) {
  const m = /([\d.]+)\s*(MB|GB|TB)?/i.exec(label);
  if (!m) return 1e9;
  const n = Number(m[1]);
  const unit = (m[2] ?? "GB").toUpperCase();
  return unit === "MB" ? n / 1024 : unit === "TB" ? n * 1024 : n;
}

/* ---------- Customer ---------- */

/** Plans on sale with their active prices. */
export async function plansForSale(db: Db) {
  const plans = await db.select().from(esimPlans).where(eq(esimPlans.active, true)).orderBy(asc(esimPlans.position));
  if (!plans.length) return [];
  const prices = await db.select().from(esimPrices)
    .where(and(inArray(esimPrices.planId, plans.map((p) => p.id)), eq(esimPrices.active, true)));
  return plans
    .map((p) => {
      const mine = prices.filter((x) => x.planId === p.id);
      const data = [...new Set(mine.map((x) => x.dataLabel))].sort((a, b) => dataRank(a) - dataRank(b));
      return {
        id: p.id, name: p.name, network: p.network, description: p.description,
        allowKeepNumber: p.allowKeepNumber, keepNumberFee: p.keepNumberFee,
        data,
        prices: mine.map((x) => ({ id: x.id, dataLabel: x.dataLabel, months: x.months, price: x.price })).sort((a, b) => a.months - b.months),
      };
    })
    .filter((p) => p.prices.length > 0);
}

export const orderSchema = z.discriminatedUnion("numberMode", [
  z.object({ priceId: z.string().uuid(), imei: z.string(), numberMode: z.literal("new") }),
  z.object({
    priceId: z.string().uuid(), imei: z.string(), numberMode: z.literal("keep"),
    port: z.object({
      number: z.string().min(1, "Enter the number you want to keep"),
      carrier: z.string().trim().min(2, "Enter your current carrier").max(60),
      accountNumber: z.string().trim().min(2, "Enter your account number with that carrier").max(40),
      pin: z.string().trim().min(2, "Enter your transfer PIN").max(20),
      zip: z.string().trim().regex(/^\d{5}$/, "Enter the 5-digit billing ZIP code"),
      name: z.string().trim().min(2, "Enter the account holder's name").max(80),
    }),
  }),
]);

export async function placeEsimOrder(db: Db, userId: string, input: z.output<typeof orderSchema>) {
  const imei = checkImei(input.imei);
  if ("error" in imei) throw badRequest(imei.error);
  const [row] = await db.select({ price: esimPrices, plan: esimPlans }).from(esimPrices)
    .innerJoin(esimPlans, eq(esimPlans.id, esimPrices.planId))
    .where(and(eq(esimPrices.id, input.priceId), eq(esimPrices.active, true), eq(esimPlans.active, true)));
  if (!row) throw badRequest("That plan isn't available any more. Please pick another.");
  let portEnc: string | null = null;
  let portNumber: string | null = null;
  let amount = row.price.price;
  if (input.numberMode === "keep") {
    if (!row.plan.allowKeepNumber) throw badRequest("Keeping an existing number isn't offered on this plan.");
    const n = usNumber(input.port.number);
    if (!n) throw badRequest("Enter the US number you want to keep, e.g. (312) 555-0123.");
    portNumber = n;
    portEnc = seal(JSON.stringify({ ...input.port, number: n }));
    amount += row.plan.keepNumberFee;
  }
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(esimOrders)
    .where(and(eq(esimOrders.userId, userId), eq(esimOrders.status, "pending")));
  if (busy.n >= 3) throw badRequest("You already have 3 eSIM orders being prepared. Please wait for those first.");
  return db.transaction(async (tx) => {
    const wallet = await walletIdForUser(tx, userId);
    const label = `${row.plan.name} ${row.price.dataLabel} · ${monthsLabel(row.price.months)}`;
    const holdId = await placeHold(tx, wallet, amount, "esim_order", { memo: `eSIM: ${label}` });
    const [o] = await tx.insert(esimOrders).values({
      userId, planId: row.plan.id, planName: row.plan.name, dataLabel: row.price.dataLabel, months: row.price.months,
      amount, holdId, imei: imei.imei, numberMode: input.numberMode, portEnc, portNumber,
    }).returning();
    await linkHold(tx, holdId, o.id);
    return { id: o.id, publicId: o.publicId, amount, label };
  });
}

/** QR picture for an activation code (SVG), or the uploaded one. */
async function qrDataUrl(o: { lpa: string | null; qrImage: Buffer | null; qrType: string | null }) {
  if (o.lpa) return `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(o.lpa, { type: "svg", margin: 1, errorCorrectionLevel: "M" })).toString("base64")}`;
  if (o.qrImage && o.qrType) return `data:${o.qrType};base64,${Buffer.from(o.qrImage).toString("base64")}`;
  return null;
}

export async function myEsimOrders(db: Db, userId: string) {
  const rows = await db.select().from(esimOrders).where(eq(esimOrders.userId, userId)).orderBy(desc(esimOrders.createdAt)).limit(20);
  return Promise.all(rows.map(async (o) => ({
    id: o.id, publicId: o.publicId, label: `${o.planName} ${o.dataLabel} · ${monthsLabel(o.months)}`, amount: o.amount,
    status: o.status, numberMode: o.numberMode, keepNumber: o.portNumber ? formatUs(o.portNumber) : null,
    phoneNumber: o.phoneNumber ? formatUs(o.phoneNumber) : null, lpa: o.status === "delivered" ? o.lpa : null,
    qr: o.status === "delivered" ? await qrDataUrl(o) : null, note: o.customerNote, refundReason: o.status === "refunded" ? o.adminNote : null,
    createdAt: o.createdAt, imeiEnd: o.imei.slice(-4),
  })));
}

/* ---------- Admin fulfilment ---------- */

export async function adminEsimOrders(db: Db, status: "pending" | "delivered" | "refunded") {
  const rows = await db.select({ o: esimOrders, email: users.email, name: users.name, phone: users.phone })
    .from(esimOrders).innerJoin(users, eq(users.id, esimOrders.userId))
    .where(eq(esimOrders.status, status))
    .orderBy(status === "pending" ? asc(esimOrders.createdAt) : desc(esimOrders.updatedAt)).limit(100);
  return Promise.all(rows.map(async ({ o, email, name, phone }) => {
    let port: Record<string, string> | null = null;
    if (o.portEnc) {
      try { port = JSON.parse(open(o.portEnc)); } catch { port = { error: "Couldn't read the saved details" }; }
    }
    return {
      id: o.id, publicId: o.publicId, plan: o.planName, dataLabel: o.dataLabel, months: o.months, amount: o.amount,
      status: o.status, imei: o.imei, numberMode: o.numberMode, port: port ? { ...port, number: port.number ? formatUs(port.number) : "" } : null,
      phoneNumber: o.phoneNumber ? formatUs(o.phoneNumber) : null, lpa: o.lpa, hasQrImage: Boolean(o.qrImage),
      qr: o.status === "delivered" ? await qrDataUrl(o) : null,
      customerNote: o.customerNote, adminNote: o.adminNote, createdAt: o.createdAt, updatedAt: o.updatedAt,
      customer: { name, email, phone },
    };
  }));
}

export const deliverSchema = z.object({
  phoneNumber: z.string().min(1, "Enter the US number the eSIM got"),
  lpa: z.string().trim().max(500).optional(),
  smdp: z.string().trim().max(200).optional(),
  code: z.string().trim().max(200).optional(),
  qrImage: z.string().max(1_500_000).optional(), // data URL from the admin's upload
  note: z.string().trim().max(1000).optional(),
});

export async function deliverEsim(db: Db, id: string, input: z.output<typeof deliverSchema>) {
  const phone = usNumber(input.phoneNumber);
  if (!phone) throw badRequest("Enter the eSIM's US phone number, e.g. (312) 555-0123.");
  let lpa: string | null = null;
  if (input.lpa || input.smdp) {
    lpa = buildLpa({ lpa: input.lpa, smdp: input.smdp, code: input.code });
    if (!lpa) throw badRequest("That activation code doesn't look right. It should look like LPA:1$smdp.address$CODE, or fill in the SM-DP+ address and activation code.");
  }
  let qrImage: Buffer | null = null;
  let qrType: string | null = null;
  if (input.qrImage) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.qrImage);
    if (!m) throw badRequest("Upload the QR code as a PNG or JPG picture.");
    qrImage = Buffer.from(m[2], "base64");
    if (qrImage.length > 1_000_000) throw badRequest("That picture is too big.");
    qrType = m[1];
  }
  if (!lpa && !qrImage) throw badRequest("Add the activation code or upload the QR code picture, so the customer can install the eSIM.");
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(esimOrders).where(eq(esimOrders.id, id)).for("update");
    if (!o) throw notFound("Order");
    if (o.status !== "pending") throw badRequest("This order has already been handled.");
    const platform = await platformWalletId(tx);
    await settleHold(tx, o.holdId, o.amount, [{ walletId: platform, amount: o.amount, kind: "revenue:esim" }], {
      refType: "esim_order", refId: o.id, idempotencyKey: `esim:${o.id}:settle`,
    });
    // Port-in details aren't needed any more: wipe them.
    await tx.update(esimOrders).set({
      status: "delivered", phoneNumber: phone, lpa, qrImage, qrType, customerNote: input.note || null,
      portEnc: null, updatedAt: new Date(),
    }).where(eq(esimOrders.id, id));
    alertCustomer(db, o.userId, `Your US eSIM is ready`, [`Your ${o.planName} eSIM (${o.dataLabel}, order #${o.publicId}) is ready. Open your account to see your US number and install the eSIM.`], "esim");
    return { delivered: o.publicId };
  });
}

export async function refundEsim(db: Db, id: string, reason: string) {
  if (reason.trim().length < 3) throw badRequest("Tell the customer why (they see this).");
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(esimOrders).where(eq(esimOrders.id, id)).for("update");
    if (!o) throw notFound("Order");
    if (o.status !== "pending") throw badRequest("This order has already been handled.");
    await settleHold(tx, o.holdId, 0, [], { refType: "esim_order", refId: o.id, idempotencyKey: `esim:${o.id}:settle` });
    await tx.update(esimOrders).set({ status: "refunded", adminNote: reason.trim(), portEnc: null, updatedAt: new Date() }).where(eq(esimOrders.id, id));
    alertCustomer(db, o.userId, `US eSIM order #${o.publicId} refunded`, [`We couldn't deliver your ${o.planName} eSIM, so ${alertNaira(o.amount)} is back in your wallet.`, `Reason: ${reason.trim()}`], "wallet");
    return { refunded: o.publicId };
  });
}
