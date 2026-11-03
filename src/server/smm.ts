/**
 * Social growth orders. We resell services from one or more upstream panels
 * that speak the standard panel API (services / add / status / balance).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  orderCost, parseAdd, parseBalance, parseMultiStatus, parseServices, sellRatePer1000, settleOrder, validateQuantity,
  type OrderStatus,
} from "@/core/smm";
import type { Db } from "./db";
import { smmOrders, smmProviders, smmServices } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

type Provider = typeof smmProviders.$inferSelect;

function providerKey(p: Provider): string {
  // Trim: keys pasted from a phone often carry a trailing space or newline.
  const key = process.env[p.apiKeyEnv]?.trim();
  if (!key) throw new AppError(500, "PROVIDER_KEY_MISSING", `Set ${p.apiKeyEnv} in the environment for provider "${p.name}".`);
  return key;
}

async function call(p: Provider, params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams({ key: providerKey(p), ...params });
  const res = await fetch(p.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Provider "${p.name}" returned a non-JSON response (HTTP ${res.status}).`);
  }
}

/** For admin screens: show what the provider actually said instead of a generic error. */
async function adminProviderCall<T>(p: Provider, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = (e as Error).message || "Unknown error";
    const hint = /api key|invalid key|unauthori[sz]ed/i.test(msg)
      ? ` Check ${p.apiKeyEnv} in Vercel (copy the key again from ${p.name}, no spaces), then redeploy.`
      : "";
    throw new AppError(502, "PROVIDER_ERROR", `${p.name} said: "${msg}".${hint}`);
  }
}

export async function providerBalance(db: Db, providerId: string) {
  const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, providerId));
  if (!p) throw notFound("Provider");
  return adminProviderCall(p, async () => parseBalance(await call(p, { action: "balance" })));
}

/** Pull the provider's catalogue and upsert our priced copy of it. */
export async function syncServices(db: Db, providerId: string) {
  const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, providerId));
  if (!p) throw notFound("Provider");
  const list = await adminProviderCall(p, async () => parseServices(await call(p, { action: "services" })));
  let upserted = 0;
  for (const s of list) {
    const rateKobo = sellRatePer1000(s.rate, p.fxKoboPerUnit, p.markupBps);
    await db
      .insert(smmServices)
      .values({
        providerId: p.id, providerServiceId: s.service, name: s.name, category: s.category, type: s.type,
        providerRate: s.rate, rateKobo, minQty: s.min, maxQty: s.max, refill: s.refill, cancel: s.cancel,
      })
      .onConflictDoUpdate({
        target: [smmServices.providerId, smmServices.providerServiceId],
        set: { name: s.name, category: s.category, type: s.type, providerRate: s.rate, rateKobo, minQty: s.min, maxQty: s.max, refill: s.refill, cancel: s.cancel, updatedAt: new Date() },
      });
    upserted++;
  }
  return { upserted };
}

export async function listServices(db: Db) {
  return db
    .select({
      id: smmServices.publicId, name: smmServices.name, category: smmServices.category, type: smmServices.type,
      rateKobo: smmServices.rateKobo, min: smmServices.minQty, max: smmServices.maxQty, refill: smmServices.refill, cancel: smmServices.cancel,
    })
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(and(eq(smmServices.active, true), eq(smmProviders.active, true)))
    .orderBy(smmServices.category, smmServices.name);
}

function validLink(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    // Some services take a username instead of a URL.
    return /^@?[A-Za-z0-9_.]{2,60}$/.test(link);
  }
}

/**
 * Place an order: hold the cost, send it upstream, and refund straight away if
 * the provider rejects it. Money is only captured once the order delivers.
 */
export async function placeOrder(
  db: Db,
  userId: string,
  input: { servicePublicId: number; link: string; quantity: number; apiKeyId?: string },
) {
  const [svc] = await db.select().from(smmServices).where(eq(smmServices.publicId, input.servicePublicId));
  if (!svc || !svc.active) throw notFound("Service");
  const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, svc.providerId));
  if (!p || !p.active) throw notFound("Service");

  const link = input.link.trim();
  if (!validLink(link)) throw badRequest("Paste a valid link or username for this service.");
  const qtyErr = validateQuantity(input.quantity, svc.minQty, svc.maxQty);
  if (qtyErr) throw badRequest(qtyErr);
  const cost = orderCost(svc.rateKobo, input.quantity);

  const order = await db.transaction(async (tx) => {
    const walletId = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, walletId, cost, "smm_order", { memo: `${svc.name} x${input.quantity}` });
    const [o] = await tx
      .insert(smmOrders)
      .values({ userId, serviceId: svc.id, link, quantity: input.quantity, cost, holdId, apiKeyId: input.apiKeyId })
      .returning();
    await linkHold(tx, holdId, o.id);
    return o;
  });

  try {
    const providerOrderId = parseAdd(await call(p, { action: "add", service: svc.providerServiceId, link, quantity: String(input.quantity) }));
    const [o] = await db.update(smmOrders).set({ providerOrderId, status: "PENDING", updatedAt: new Date() }).where(eq(smmOrders.id, order.id)).returning();
    return o;
  } catch (e) {
    // Provider refused or was unreachable: refund the hold and mark the order failed.
    const message = (e as Error).message.slice(0, 300);
    await db.transaction(async (tx) => {
      await settleHold(tx, order.holdId, 0, [], { refType: "smm_order", refId: order.id, idempotencyKey: `smm:${order.id}:settle` });
      await tx.update(smmOrders).set({ status: "FAILED", error: message, updatedAt: new Date() }).where(eq(smmOrders.id, order.id));
    });
    throw new AppError(502, "PROVIDER_REJECTED", "The service couldn't start this order, so your money is back in your wallet. Try again or pick another service.");
  }
}

/** Cron: ask providers for the status of open orders and settle finished ones. */
export async function syncOrders(db: Db) {
  const open = await db
    .select({ order: smmOrders, providerId: smmServices.providerId })
    .from(smmOrders)
    .innerJoin(smmServices, eq(smmServices.id, smmOrders.serviceId))
    .where(inArray(smmOrders.status, ["PENDING", "PROCESSING"]))
    .limit(500);

  const byProvider = new Map<string, (typeof open)[number]["order"][]>();
  for (const row of open) {
    if (!row.order.providerOrderId) continue;
    const list = byProvider.get(row.providerId) ?? [];
    list.push(row.order);
    byProvider.set(row.providerId, list);
  }

  const result = { checked: 0, settled: 0, errors: [] as string[] };
  for (const [providerId, orders] of byProvider) {
    const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, providerId));
    if (!p) continue;
    for (let i = 0; i < orders.length; i += 100) {
      const batch = orders.slice(i, i + 100);
      let statuses;
      try {
        statuses = parseMultiStatus(await call(p, { action: "status", orders: batch.map((o) => o.providerOrderId).join(",") }));
      } catch (e) {
        result.errors.push(`${p.name}: ${(e as Error).message}`);
        continue;
      }
      for (const o of batch) {
        const st = statuses.get(o.providerOrderId!);
        if (!st || st.error) continue;
        result.checked++;
        await applyStatus(db, o.id, st.status, st.startCount, st.remains);
        if (settleOrder(o.cost, o.quantity, st.status, st.remains)) result.settled++;
      }
    }
  }
  return result;
}

async function applyStatus(db: Db, orderId: string, status: OrderStatus, startCount: number | null, remains: number | null) {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(smmOrders).where(eq(smmOrders.id, orderId)).for("update");
    if (!o || (o.status !== "PENDING" && o.status !== "PROCESSING")) return;
    const settle = settleOrder(o.cost, o.quantity, status, remains);
    if (settle) {
      const platform = await platformWalletId(tx);
      await settleHold(
        tx,
        o.holdId,
        settle.capture,
        settle.capture > 0 ? [{ walletId: platform, amount: settle.capture, kind: "revenue:smm" }] : [],
        { refType: "smm_order", refId: o.id, idempotencyKey: `smm:${o.id}:settle` },
      );
    }
    await tx
      .update(smmOrders)
      .set({ status, startCount: startCount ?? o.startCount, remains: remains ?? o.remains, charged: settle ? settle.capture : o.charged, updatedAt: new Date() })
      .where(eq(smmOrders.id, o.id));
  });
}

export async function myOrders(db: Db, userId: string, ids?: number[]) {
  const where = ids && ids.length
    ? and(eq(smmOrders.userId, userId), inArray(smmOrders.publicId, ids))
    : eq(smmOrders.userId, userId);
  return db
    .select({
      id: smmOrders.publicId, service: smmServices.name, link: smmOrders.link, quantity: smmOrders.quantity,
      cost: smmOrders.cost, charged: smmOrders.charged, status: smmOrders.status, startCount: smmOrders.startCount,
      remains: smmOrders.remains, createdAt: smmOrders.createdAt,
    })
    .from(smmOrders)
    .innerJoin(smmServices, eq(smmServices.id, smmOrders.serviceId))
    .where(where)
    .orderBy(desc(smmOrders.createdAt))
    .limit(100);
}

/** Change a provider's markup and/or pause it. Re-prices every service from that provider straight away. */
export async function updateProvider(db: Db, providerId: string, input: { markupBps?: number; active?: boolean }) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(smmProviders).where(eq(smmProviders.id, providerId)).for("update");
    if (!p) throw notFound("Provider");
    const markupBps = input.markupBps ?? p.markupBps;
    const [updated] = await tx
      .update(smmProviders)
      .set({ markupBps, active: input.active ?? p.active })
      .where(eq(smmProviders.id, p.id))
      .returning();
    let repriced = 0;
    if (markupBps !== p.markupBps) {
      const services = await tx.select({ id: smmServices.id, providerRate: smmServices.providerRate }).from(smmServices).where(eq(smmServices.providerId, p.id));
      for (const s of services) {
        await tx.update(smmServices).set({ rateKobo: sellRatePer1000(s.providerRate, p.fxKoboPerUnit, markupBps), updatedAt: new Date() }).where(eq(smmServices.id, s.id));
        repriced++;
      }
    }
    return { provider: updated, repriced };
  });
}
