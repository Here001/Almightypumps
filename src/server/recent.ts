/** The customer's latest orders across every service, for the "Recent orders" box on the Services home. */
import { desc, eq } from "drizzle-orm";
import type { Db } from "./db";
import { giftOrders, shopOrders, shopProducts, smmOrders, smmServices, topupOrders, travelEsimOrders } from "./db/schema";

export type RecentOrder = { key: string; title: string; detail: string; amount: number; status: string; tone: "ok" | "pend" | "bad"; at: string; tab: string };

const SMM: Record<string, [string, RecentOrder["tone"]]> = {
  QUEUED: ["In queue", "pend"], PENDING: ["Starting", "pend"], PROCESSING: ["Delivering", "pend"], COMPLETED: ["Delivered", "ok"],
  PARTIAL: ["Partly delivered", "ok"], CANCELLED: ["Refunded", "bad"], FAILED: ["Refunded", "bad"],
};
const SIMPLE: Record<string, [string, RecentOrder["tone"]]> = {
  pending: ["In progress", "pend"], delivered: ["Delivered", "ok"], refunded: ["Refunded", "bad"], failed: ["Refunded", "bad"],
};

export async function recentOrders(db: Db, userId: string, limit = 4): Promise<RecentOrder[]> {
  const [boost, top, gift, travel, shop] = await Promise.all([
    db.select({ id: smmOrders.publicId, display: smmServices.displayName, name: smmServices.name, qty: smmOrders.quantity, cost: smmOrders.cost, charged: smmOrders.charged, status: smmOrders.status, at: smmOrders.createdAt })
      .from(smmOrders).innerJoin(smmServices, eq(smmServices.id, smmOrders.serviceId)).where(eq(smmOrders.userId, userId)).orderBy(desc(smmOrders.createdAt)).limit(limit),
    db.select().from(topupOrders).where(eq(topupOrders.userId, userId)).orderBy(desc(topupOrders.createdAt)).limit(limit),
    db.select().from(giftOrders).where(eq(giftOrders.userId, userId)).orderBy(desc(giftOrders.createdAt)).limit(limit),
    db.select().from(travelEsimOrders).where(eq(travelEsimOrders.userId, userId)).orderBy(desc(travelEsimOrders.createdAt)).limit(limit),
    db.select({ id: shopOrders.id, amount: shopOrders.amount, status: shopOrders.status, at: shopOrders.createdAt, name: shopProducts.name })
      .from(shopOrders).innerJoin(shopProducts, eq(shopProducts.id, shopOrders.productId)).where(eq(shopOrders.userId, userId)).orderBy(desc(shopOrders.createdAt)).limit(limit),
  ]);
  const s = (m: Record<string, [string, RecentOrder["tone"]]>, st: string) => m[st] ?? [st, "pend" as const];
  const all: (RecentOrder & { t: number })[] = [
    ...boost.map((o) => { const [status, tone] = s(SMM, o.status); return { key: `b${o.id}`, title: `Boost #${o.id}`, detail: `${o.display || o.name} × ${o.qty.toLocaleString("en-NG")}`, amount: Number(o.charged || o.cost), status, tone, at: o.at.toISOString(), tab: "orders", t: o.at.getTime() }; }),
    ...top.map((o) => { const [status, tone] = s(SIMPLE, o.status); return { key: `t${o.id}`, title: o.kind === "data" ? "Data" : "Airtime", detail: `${o.description} to ${o.phone}`, amount: o.priceKobo, status, tone, at: o.createdAt.toISOString(), tab: "airtime", t: o.createdAt.getTime() }; }),
    ...gift.map((o) => { const [status, tone] = s(SIMPLE, o.status); return { key: `g${o.id}`, title: "Gift card", detail: `${o.productName} ${Number(o.faceValue)} ${o.faceCurrency}`, amount: o.priceKobo, status, tone, at: o.createdAt.toISOString(), tab: "giftcards", t: o.createdAt.getTime() }; }),
    ...travel.map((o) => { const [status, tone] = s(SIMPLE, o.status); return { key: `e${o.id}`, title: "Travel eSIM", detail: o.packageName, amount: o.priceKobo, status, tone, at: o.createdAt.toISOString(), tab: "esim", t: o.createdAt.getTime() }; }),
    ...shop.map((o) => { const [status, tone] = s(SIMPLE, o.status); return { key: `s${o.id}`, title: `Shop #S-${o.id}`, detail: o.name, amount: Number(o.amount), status, tone, at: o.at.toISOString(), tab: "orders", t: o.at.getTime() }; }),
  ];
  return all.sort((a, b) => b.t - a.t).slice(0, limit).map(({ t: _t, ...r }) => r);
}
