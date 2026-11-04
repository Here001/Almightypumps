/**
 * Gift cards from Reloadly. Catalogue synced daily for the countries the admin picks. A customer buys one
 * card: the price is held, we order from Reloadly, and when the code arrives the hold is captured and the
 * code (stored encrypted) is shown. If Reloadly refuses or fails, the hold is released (refund).
 */
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { costToKobo, giftCost, parseGiftProduct, withMarkup, type GiftData } from "@/core/instant";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { giftOrders, giftProducts, users } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { getUsdRateKobo } from "./pricing";
import { ReloadlyGift, adminReason, reloadlyConfigured, reloadlyMode, type RlCard } from "./reloadly";
import { open, seal } from "./secretBox";
import { alertSupplierFunds, isOutOfFunds, WAIT_LIMIT_MS } from "./supplierFunds";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

export type GiftConfig = { markupBps: number; enabled: boolean; countries: string[]; syncedAt: string | null };
const DEFAULTS: GiftConfig = { markupBps: 1500, enabled: true, countries: ["US", "GB", "CA", "NG"], syncedAt: null };
const SYNC_EVERY_MS = 24 * 3600_000;
/** Brands shown first when the admin hasn't starred any. */
const POPULAR = ["amazon", "apple", "itunes", "google play", "playstation", "steam", "xbox", "netflix", "spotify", "razer", "nintendo", "uber", "walmart", "ebay", "visa", "roblox"];

export const getGiftConfig = (db: Db) => readSetting(db, "gift_cards", DEFAULTS);

export async function updateGiftConfig(db: Db, input: { markupBps?: number; enabled?: boolean; countries?: string[] }) {
  const cfg = await getGiftConfig(db);
  if (input.markupBps !== undefined && (!Number.isInteger(input.markupBps) || input.markupBps < 0 || input.markupBps > 100_000)) throw badRequest("Markup must be between 0% and 1000%.");
  const countries = input.countries?.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  if (countries && countries.length === 0) throw badRequest("Pick at least one country.");
  return writeSetting(db, "gift_cards", { ...cfg, ...input, ...(countries ? { countries: [...new Set(countries)] } : {}) });
}

/** Pull the catalogue for the chosen countries. Keeps the admin's hidden/star flags. */
export async function syncGiftProducts(db: Db) {
  const cfg = await getGiftConfig(db);
  const seen: number[] = [];
  const now = new Date();
  let skipped = 0;
  for (const iso of cfg.countries) {
    for (let page = 1; page <= 20; page++) {
      const r = await ReloadlyGift.countryProducts(iso, page);
      const list = Array.isArray(r) ? r : r.content ?? [];
      if (page === 1) console.log(`[giftcards] ${iso} page1 count=${list.length} keys=${Object.keys(list[0] ?? {}).join(",").slice(0, 300)}`);
      const rows = list.map(parseGiftProduct).filter((x): x is NonNullable<typeof x> => Boolean(x));
      skipped += list.length - rows.length;
      for (const p of rows) {
        await db.insert(giftProducts).values({ productId: p.id, country: p.country, name: p.name.slice(0, 160), brand: p.brand.slice(0, 120), data: p.data, seenAt: now })
          .onConflictDoUpdate({ target: giftProducts.productId, set: { country: p.country, name: p.name.slice(0, 160), brand: p.brand.slice(0, 120), data: p.data, seenAt: now } });
        seen.push(p.id);
      }
      const totalPages = Array.isArray(r) ? 1 : r.totalPages ?? 1;
      if (page >= totalPages || list.length === 0) break;
    }
  }
  if (seen.length === 0) throw new AppError(502, "PROVIDER_ERROR", "Reloadly returned no gift cards for those countries.");
  await db.delete(giftProducts).where(notInArray(giftProducts.productId, seen));
  await writeSetting(db, "gift_cards", { ...cfg, syncedAt: now.toISOString() });
  return { products: seen.length, skipped };
}

function assertOpen(cfg: GiftConfig) {
  if (!reloadlyConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Gift cards aren't available yet. Please check back soon.");
  if (!cfg.enabled) throw new AppError(503, "PAUSED", "Gift cards are paused right now. Please check back soon.");
}

async function ensureSynced(db: Db, cfg: GiftConfig) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(giftProducts);
  if (n === 0 || !cfg.syncedAt || Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) {
    await syncGiftProducts(db).catch((e) => { if (n === 0) throw e; console.error("[giftcards] sync failed", e); });
  }
}

/** Naira price for one card of `value`, or null if it can't be priced. */
function priceFor(d: GiftData, value: number, rate: number, markupBps: number) {
  const cost = giftCost(d, value);
  if (cost === null) return null;
  const kobo = costToKobo(cost, d.senderCurrency, rate);
  return kobo ? { priceKobo: withMarkup(kobo, markupBps, 1000), cost } : null;
}

const rank = (brand: string) => { const b = brand.toLowerCase(); const i = POPULAR.findIndex((p) => b.includes(p)); return i === -1 ? 999 : i; };

/** Customer catalogue for one country (or all), with Naira prices per card value. */
export async function giftCatalog(db: Db, country?: string, q?: string) {
  const cfg = await getGiftConfig(db);
  assertOpen(cfg);
  await ensureSynced(db, cfg);
  const rate = await getUsdRateKobo(db);
  const filters = [eq(giftProducts.hidden, false)];
  if (country) filters.push(eq(giftProducts.country, country.toUpperCase()));
  if (q?.trim()) {
    const like = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(or(ilike(giftProducts.name, like), ilike(giftProducts.brand, like))!);
  }
  const rows = await db.select().from(giftProducts).where(and(...filters)).orderBy(asc(giftProducts.brand));
  const countries = await db.select({ c: giftProducts.country, n: sql<number>`count(*)::int` }).from(giftProducts).where(eq(giftProducts.hidden, false)).groupBy(giftProducts.country);
  const products = rows
    .map((r) => {
      const d = r.data as GiftData;
      const values = d.type === "FIXED"
        ? d.fixed.map((f) => ({ value: f.value, priceKobo: priceFor(d, f.value, rate, cfg.markupBps)?.priceKobo ?? 0 })).filter((v) => v.priceKobo > 0)
        : [];
      const range = d.type === "RANGE" && d.min !== null && d.max !== null
        ? { min: d.min, max: d.max, minPriceKobo: priceFor(d, d.min, rate, cfg.markupBps)?.priceKobo ?? 0, maxPriceKobo: priceFor(d, d.max, rate, cfg.markupBps)?.priceKobo ?? 0 }
        : null;
      return {
        id: r.productId, name: r.name, brand: r.brand, country: r.country, currency: d.currency, logo: d.logo, featured: r.featured,
        values, range: range && range.minPriceKobo > 0 ? range : null,
      };
    })
    .filter((p) => p.values.length > 0 || p.range)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || rank(a.brand) - rank(b.brand) || a.name.localeCompare(b.name));
  return { countries: countries.map((c) => ({ code: c.c, products: c.n })).sort((a, b) => b.products - a.products), products };
}

export async function giftQuote(db: Db, productId: number, value: number) {
  const cfg = await getGiftConfig(db);
  assertOpen(cfg);
  const [p] = await db.select().from(giftProducts).where(eq(giftProducts.productId, productId));
  if (!p || p.hidden) throw notFound("Gift card");
  const d = p.data as GiftData;
  const rate = await getUsdRateKobo(db);
  const priced = priceFor(d, value, rate, cfg.markupBps);
  if (!priced) throw badRequest(d.type === "RANGE" ? `Choose an amount between ${d.min} and ${d.max} ${d.currency}.` : "That card value isn't available.");
  return { product: p, data: d, ...priced, redeem: d.redeem };
}

/** Buy one card. `expectedKobo` = the price the customer saw. */
export async function buyGiftCard(db: Db, userId: string, productId: number, value: number, expectedKobo: number) {
  const q = await giftQuote(db, productId, value);
  if (q.priceKobo !== expectedKobo) throw new AppError(409, "PRICE_CHANGED", "The price just changed. Check the new price and try again.", { priceKobo: q.priceKobo });
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(giftOrders).where(and(eq(giftOrders.userId, userId), eq(giftOrders.status, "pending")));
  if (busy.n >= 3) throw badRequest("You have 3 gift cards still being delivered. Please wait a moment.");
  const order = await db.transaction(async (tx) => {
    const wallet = await walletIdForUser(tx, userId);
    const label = `${q.product.name} ${value} ${q.data.currency}`;
    const holdId = await placeHold(tx, wallet, q.priceKobo, "gift_card", { memo: `Gift card: ${label}` });
    const [o] = await tx.insert(giftOrders).values({
      userId, productId, productName: q.product.name, country: q.product.country, faceValue: String(value), faceCurrency: q.data.currency,
      priceKobo: q.priceKobo, holdId,
    }).returning();
    await linkHold(tx, holdId, o.id);
    return o;
  });
  await sendGiftOrder(db, order.id);
  return presentOne(db, order.id);
}

/** Send (or re-send) an order to Reloadly. Out of balance → it waits (money held) and the owner is emailed. */
async function sendGiftOrder(db: Db, id: string) {
  const [order] = await db.select().from(giftOrders).where(eq(giftOrders.id, id));
  if (!order || order.status !== "pending" || order.providerTx) return;
  const value = Number(order.faceValue);
  try {
    const r = await ReloadlyGift.order({ productId: order.productId, countryCode: order.country, unitPrice: value, customIdentifier: order.id });
    console.log(`[giftcards] order ${order.publicId} tx=${r.transactionId} status=${r.status} amount=${r.amount} ${r.currencyCode}`);
    await db.update(giftOrders).set({
      providerTx: String(r.transactionId), cost: r.amount !== undefined ? String(r.amount) : order.cost,
      costCurrency: r.currencyCode ?? order.costCurrency, waitingFunds: false, error: null, updatedAt: new Date(),
    }).where(eq(giftOrders.id, order.id));
    await refreshGiftOrder(db, order.id).catch((e) => console.error("[giftcards] first fetch", e));
  } catch (e) {
    const status = e instanceof AppError ? (e.details as { status?: number } | undefined)?.status : undefined;
    if (isOutOfFunds((e as Error).message)) {
      await db.update(giftOrders).set({ waitingFunds: true, error: "Waiting for Reloadly balance", updatedAt: new Date() }).where(eq(giftOrders.id, order.id));
      await alertSupplierFunds(db, "Reloadly", { adminPath: "/admin/instant" });
      return;
    }
    if (order.waitingFunds && status && status >= 500) return; // try again next run
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      await closeGift(db, order.id, "failed", { error: e instanceof Error ? e.message : String(e) });
      if (!order.waitingFunds) throw new AppError(502, "PROVIDER_ERROR", `We couldn't buy that card right now (${(e as Error).message}). You have not been charged.`);
      return;
    }
    // Timeout or provider outage: it may still have gone through. The cron checks and settles it.
    console.error("[giftcards] order unclear", order.id, e);
    await db.update(giftOrders).set({ waitingFunds: false, error: "Checking with the provider", updatedAt: new Date() }).where(eq(giftOrders.id, order.id));
  }
}

/** Capture (delivered) or release (refunded/failed). Safe to call twice. */
async function closeGift(db: Db, id: string, status: "delivered" | "refunded" | "failed", extra: { codes?: RlCard[]; error?: string } = {}) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(giftOrders).where(eq(giftOrders.id, id)).for("update");
    if (!o || o.status !== "pending") return o;
    const capture = status === "delivered" ? o.priceKobo : 0;
    const platform = capture ? await platformWalletId(tx) : null;
    await settleHold(tx, o.holdId, capture, platform ? [{ walletId: platform, amount: capture, kind: "revenue:gift_card" }] : [], {
      refType: "gift_card", refId: o.id, idempotencyKey: `gift:${o.id}:settle`,
    });
    const [u] = await tx.update(giftOrders).set({
      status, codesEnc: extra.codes ? seal(JSON.stringify(extra.codes)) : o.codesEnc, error: extra.error ?? (status === "delivered" ? null : o.error), updatedAt: new Date(),
    }).where(eq(giftOrders.id, id)).returning();
    return u;
  });
}

/** Ask Reloadly about a pending order: deliver when codes are there, refund when it failed. */
export async function refreshGiftOrder(db: Db, id: string) {
  const [o] = await db.select().from(giftOrders).where(eq(giftOrders.id, id));
  if (!o || o.status !== "pending") return o;
  if (o.waitingFunds) {
    if (Date.now() - o.createdAt.getTime() > WAIT_LIMIT_MS) return closeGift(db, id, "refunded", { error: "Refunded: supplier balance wasn't topped up in time" });
    await sendGiftOrder(db, id);
    return (await db.select().from(giftOrders).where(eq(giftOrders.id, id)))[0];
  }
  let tx = o.providerTx;
  if (!tx) {
    const found = await ReloadlyGift.findByCustomId(o.id);
    if (!found) {
      if (Date.now() - o.createdAt.getTime() > 10 * 60_000) return closeGift(db, id, "refunded", { error: "The provider never received the order." });
      return o;
    }
    tx = String(found.transactionId);
    await db.update(giftOrders).set({ providerTx: tx, cost: found.amount !== undefined ? String(found.amount) : o.cost, costCurrency: found.currencyCode ?? o.costCurrency }).where(eq(giftOrders.id, id));
  }
  const cards = await ReloadlyGift.cards(tx).catch(() => [] as RlCard[]);
  const usable = (Array.isArray(cards) ? cards : []).filter((c) => c.cardNumber || c.pinCode || c.redemptionUrl);
  if (usable.length) return closeGift(db, id, "delivered", { codes: usable.map((c) => ({ cardNumber: c.cardNumber ?? null, pinCode: c.pinCode ?? null, redemptionUrl: c.redemptionUrl ?? null })) });
  const t = await ReloadlyGift.transaction(tx).catch(() => null);
  const st = String(t?.status ?? "").toUpperCase();
  if (st === "FAILED" || st === "REFUNDED") return closeGift(db, id, "refunded", { error: `Provider status: ${st.toLowerCase()}` });
  return o;
}

function codesOf(o: typeof giftOrders.$inferSelect): RlCard[] {
  if (!o.codesEnc) return [];
  try { return JSON.parse(open(o.codesEnc)) as RlCard[]; } catch { return []; }
}

function present(o: typeof giftOrders.$inferSelect, redeem?: string | null) {
  return {
    id: o.id, publicId: o.publicId, name: o.productName, country: o.country, value: Number(o.faceValue), currency: o.faceCurrency,
    priceKobo: o.priceKobo, status: o.status, waiting: o.status === "pending" && o.waitingFunds, codes: o.status === "delivered" ? codesOf(o) : [], redeem: redeem ?? null,
    createdAt: o.createdAt,
  };
}

async function presentOne(db: Db, id: string) {
  const [o] = await db.select().from(giftOrders).where(eq(giftOrders.id, id));
  const [p] = await db.select({ data: giftProducts.data }).from(giftProducts).where(eq(giftProducts.productId, o.productId));
  return present(o, (p?.data as GiftData | undefined)?.redeem);
}

export async function myGiftOrders(db: Db, userId: string) {
  const rows = await db.select().from(giftOrders).where(eq(giftOrders.userId, userId)).orderBy(desc(giftOrders.createdAt)).limit(20);
  const ids = [...new Set(rows.map((r) => r.productId))];
  const prods = ids.length ? await db.select({ id: giftProducts.productId, data: giftProducts.data }).from(giftProducts).where(inArray(giftProducts.productId, ids)) : [];
  const redeem = new Map(prods.map((p) => [p.id, (p.data as GiftData).redeem]));
  return rows.map((o) => present(o, redeem.get(o.productId)));
}

export async function myGiftOrder(db: Db, userId: string, id: string) {
  const [o] = await db.select().from(giftOrders).where(and(eq(giftOrders.id, id), eq(giftOrders.userId, userId)));
  if (!o) throw notFound("Order");
  if (o.status === "pending") await refreshGiftOrder(db, id).catch((e) => console.error("[giftcards] refresh", e));
  return presentOne(db, id);
}

/** Cron: settle pending orders; re-sync the catalogue daily. */
export async function sweepGiftOrders(db: Db) {
  if (!reloadlyConfigured()) return { checked: 0 };
  const pending = await db.select({ id: giftOrders.id }).from(giftOrders).where(eq(giftOrders.status, "pending")).orderBy(asc(giftOrders.createdAt)).limit(20);
  for (const p of pending) await refreshGiftOrder(db, p.id).catch((e) => console.error("[giftcards] sweep", p.id, e));
  const cfg = await getGiftConfig(db);
  if (cfg.enabled && cfg.syncedAt && Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) await syncGiftProducts(db).catch((e) => console.error("[giftcards] sync", e));
  return { checked: pending.length };
}

/* ---------- Admin ---------- */

export async function giftAdminOverview(db: Db, q?: string) {
  const cfg = await getGiftConfig(db);
  const configured = reloadlyConfigured();
  const balance = configured ? await ReloadlyGift.balance().then((b) => ({ amount: b.balance, currency: b.currencyCode, error: null }), (e: Error) => ({ amount: null, currency: null, error: adminReason(e) })) : null;
  const [stats] = await db.select({
    delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
    refunded: sql<number>`count(*) filter (where status in ('refunded','failed'))::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    revenueKobo: sql<number>`coalesce(sum(price_kobo) filter (where status = 'delivered'), 0)::bigint`,
  }).from(giftOrders);
  const recent = await db.select({ o: giftOrders, email: users.email }).from(giftOrders).innerJoin(users, eq(users.id, giftOrders.userId)).orderBy(desc(giftOrders.createdAt)).limit(30);
  const like = q?.trim() ? `%${q.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
  const products = await db.select({ id: giftProducts.productId, name: giftProducts.name, brand: giftProducts.brand, country: giftProducts.country, hidden: giftProducts.hidden, featured: giftProducts.featured })
    .from(giftProducts).where(like ? or(ilike(giftProducts.name, like), ilike(giftProducts.brand, like)) : undefined)
    .orderBy(sql`${giftProducts.featured} desc`, asc(giftProducts.brand)).limit(like ? 100 : 60);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(giftProducts);
  return {
    config: cfg, configured, mode: reloadlyMode(), balance,
    stats: { ...stats, revenueKobo: Number(stats.revenueKobo) },
    recent: recent.map(({ o, email }) => ({
      id: o.id, publicId: o.publicId, name: o.productName, value: `${o.faceValue} ${o.faceCurrency}`, priceKobo: o.priceKobo,
      cost: o.cost ? `${o.cost} ${o.costCurrency ?? ""}` : null, status: o.status, error: o.error, email, createdAt: o.createdAt,
    })),
    products, totalProducts: total,
  };
}

export async function setGiftFlags(db: Db, ids: number[], flags: { hidden?: boolean; featured?: boolean }) {
  if (!ids.length) return { updated: 0 };
  const r = await db.update(giftProducts).set(flags).where(inArray(giftProducts.productId, ids)).returning({ id: giftProducts.productId });
  return { updated: r.length };
}

/** Admin: give up on a stuck order and refund the customer. */
export async function adminRefundGift(db: Db, id: string) {
  const o = await refreshGiftOrder(db, id).catch(() => null);
  if (o && o.status !== "pending") return { status: o.status };
  const u = await closeGift(db, id, "refunded", { error: "Refunded by admin" });
  return { status: u?.status };
}
