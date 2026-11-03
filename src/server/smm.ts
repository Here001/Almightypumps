/**
 * Social growth orders. We resell services from one or more upstream panels
 * that speak the standard panel API (services / add / status / balance).
 */
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  orderCost, parseAdd, parseBalance, parseMultiStatus, parseServices, sellRatePer1000, settleOrder, validateQuantity,
  type OrderStatus,
} from "@/core/smm";
import { displayName, isRestricted, kindFor, platformFor, POPULAR_PLATFORMS } from "@/core/catalog";
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
  const key = providerKey(p);
  // Standard panels read "key"; some custom-built panels read "api_key". Sending both is harmless.
  const body = new URLSearchParams({ key, api_key: key, ...params });
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
    // Diagnostics only: never log the key itself.
    const raw = process.env[p.apiKeyEnv] ?? "";
    console.error(`[provider] ${p.name} ${p.apiUrl}: ${msg} (key length ${raw.trim().length}, had outer spaces: ${raw !== raw.trim()}, inner spaces: ${/\s/.test(raw.trim())})`);
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

/**
 * Pull the provider's catalogue and upsert our priced copy of it, in batches
 * (one round trip per 200 services, not per service). Free/zero-priced services
 * are skipped, and services the provider no longer lists are hidden.
 */
export async function syncServices(db: Db, providerId: string) {
  const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, providerId));
  if (!p) throw notFound("Provider");
  const list = await adminProviderCall(p, async () => parseServices(await call(p, { action: "services" })));

  const rows = new Map<string, typeof smmServices.$inferInsert>();
  let skipped = 0;
  let restricted = 0;
  for (const s of list) {
    if (isRestricted(s.name, s.category)) {
      restricted++;
      continue;
    }
    let rateKobo = 0;
    try {
      rateKobo = sellRatePer1000(s.rate, p.fxKoboPerUnit, p.markupBps);
    } catch {
      rateKobo = 0;
    }
    if (rateKobo <= 0 || s.min > s.max) {
      skipped++;
      continue;
    }
    rows.set(s.service, {
      providerId: p.id, providerServiceId: s.service, name: s.name.slice(0, 300), category: s.category.slice(0, 120), type: s.type,
      providerRate: s.rate, rateKobo, minQty: s.min, maxQty: s.max, refill: s.refill, cancel: s.cancel, active: true, updatedAt: new Date(),
      platform: platformFor(s.category), kind: kindFor(s.name), displayName: displayName(s.name).slice(0, 300),
    });
  }

  const values = [...rows.values()];
  const excluded = (col: string) => sql.raw(`excluded.${col}`);
  for (let i = 0; i < values.length; i += 200) {
    await db
      .insert(smmServices)
      .values(values.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [smmServices.providerId, smmServices.providerServiceId],
        set: {
          name: excluded("name"), category: excluded("category"), type: excluded("type"), providerRate: excluded("provider_rate"),
          rateKobo: excluded("rate_kobo"), minQty: excluded("min_qty"), maxQty: excluded("max_qty"), refill: excluded("refill"),
          cancel: excluded("cancel"), active: sql`true`, updatedAt: excluded("updated_at"),
          platform: excluded("platform"), kind: excluded("kind"), displayName: excluded("display_name"),
        },
      });
  }

  // Hide services the provider has dropped (or that are now free), so customers can't order them.
  const keep = [...rows.keys()];
  const hidden = await db
    .update(smmServices)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(smmServices.providerId, p.id), eq(smmServices.active, true), keep.length ? notInArray(smmServices.providerServiceId, keep) : sql`true`))
    .returning({ id: smmServices.id });

  return { upserted: values.length, skipped, restricted, hidden: hidden.length };
}

const serviceColumns = {
  id: smmServices.publicId, name: smmServices.name, category: smmServices.category, type: smmServices.type,
  rateKobo: smmServices.rateKobo, min: smmServices.minQty, max: smmServices.maxQty, refill: smmServices.refill, cancel: smmServices.cancel,
};
const onSale = () => and(eq(smmServices.active, true), eq(smmProviders.active, true));

/** Every service on sale (used by the reseller API, which expects the full list). */
export async function listServices(db: Db) {
  return db
    .select(serviceColumns)
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(onSale())
    .orderBy(smmServices.category, smmServices.name);
}

export type CatalogPlatform = { platform: string; count: number; kinds: { kind: string; count: number }[] };

/** Platforms (popular ones first) with their service kinds and counts. Small: sent with the dashboard. */
export async function serviceCatalog(db: Db): Promise<CatalogPlatform[]> {
  const rows = await db
    .select({ platform: smmServices.platform, kind: smmServices.kind, count: sql<number>`count(*)::int` })
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(onSale())
    .groupBy(smmServices.platform, smmServices.kind);
  const map = new Map<string, CatalogPlatform>();
  for (const r of rows) {
    const p = map.get(r.platform) ?? { platform: r.platform, count: 0, kinds: [] };
    p.count += r.count;
    p.kinds.push({ kind: r.kind, count: r.count });
    map.set(r.platform, p);
  }
  const rank = (name: string) => {
    const i = POPULAR_PLATFORMS.indexOf(name);
    return i === -1 ? POPULAR_PLATFORMS.length : i;
  };
  const kindOrder = ["Followers", "Likes", "Views", "Comments", "Shares", "Saves", "Plays", "Live viewers", "Traffic", "Other"];
  return [...map.values()]
    .map((p) => ({ ...p, kinds: p.kinds.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)) }))
    .sort((a, b) => rank(a.platform) - rank(b.platform) || b.count - a.count);
}

export type BrowseInput = { platform?: string; kind?: string; q?: string; refillOnly?: boolean; offset?: number; limit?: number };

/** One page of services for the customer browser, cheapest first. */
export async function browseServices(db: Db, input: BrowseInput) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const filters = [onSale()];
  if (input.platform) filters.push(eq(smmServices.platform, input.platform));
  if (input.kind) filters.push(eq(smmServices.kind, input.kind));
  if (input.refillOnly) filters.push(eq(smmServices.refill, true));
  const words = (input.q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  for (const w of words) {
    const like = `%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    filters.push(sql`(${smmServices.name} ILIKE ${like} OR ${smmServices.platform} ILIKE ${like} OR ${smmServices.kind} ILIKE ${like})`);
  }
  if (!input.platform && words.length === 0) return { services: [], hasMore: false };
  const rows = await db
    .select({
      id: smmServices.publicId, name: sql<string>`coalesce(nullif(${smmServices.displayName}, ''), ${smmServices.name})`,
      platform: smmServices.platform, kind: smmServices.kind, rateKobo: smmServices.rateKobo,
      min: smmServices.minQty, max: smmServices.maxQty, refill: smmServices.refill, cancel: smmServices.cancel,
    })
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(and(...filters))
    .orderBy(smmServices.rateKobo, smmServices.publicId)
    .limit(limit + 1)
    .offset(offset);
  return { services: rows.slice(0, limit), hasMore: rows.length > limit };
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
      id: smmOrders.publicId, service: sql<string>`coalesce(nullif(${smmServices.displayName}, ''), ${smmServices.name})`, platform: smmServices.platform, link: smmOrders.link, quantity: smmOrders.quantity,
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
      // Same maths as sellRatePer1000 (rate x fx x (1 + markup), rounded up), done in one statement.
      const res = await tx
        .update(smmServices)
        .set({
          rateKobo: sql`greatest(1, ceil(${smmServices.providerRate}::numeric * ${p.fxKoboPerUnit} * ${10_000 + markupBps} / 10000))::bigint`,
          updatedAt: new Date(),
        })
        .where(eq(smmServices.providerId, p.id))
        .returning({ id: smmServices.id });
      repriced = res.length;
    }
    return { provider: updated, repriced };
  });
}
