/**
 * Travel data eSIMs from eSIM Access, delivered instantly. Packages synced daily. A customer picks a country and
 * a package: the price is held, we order from eSIM Access, and when the profile (activation code) is ready the hold
 * is captured and the QR code is shown. If the order fails, the hold is released.
 */
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { dataSize, durationLabel, e4ToKobo, withMarkup } from "@/core/instant";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { travelEsimOrders, travelPackages, users } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { EsimAccess, esimAccessConfigured, type EaPackage } from "./esimaccess";
import { getUsdRateKobo } from "./pricing";
import { alertSupplierFunds, isOutOfFunds } from "./supplierFunds";
import { alertCustomer, alertNaira, PENDING_LINE } from "./customerAlerts";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

export type TravelConfig = { markupBps: number; enabled: boolean; syncedAt: string | null };
const DEFAULTS: TravelConfig = { markupBps: 15_000, enabled: true, syncedAt: null };
const SYNC_EVERY_MS = 24 * 3600_000;

export const getTravelConfig = (db: Db) => readSetting(db, "travel_esim", DEFAULTS);

export async function updateTravelConfig(db: Db, input: { markupBps?: number; enabled?: boolean }) {
  const cfg = await getTravelConfig(db);
  if (input.markupBps !== undefined && (!Number.isInteger(input.markupBps) || input.markupBps < 0 || input.markupBps > 100_000)) throw badRequest("Markup must be between 0% and 1000%.");
  return writeSetting(db, "travel_esim", { ...cfg, ...input });
}

function locationsOf(p: EaPackage): string[] {
  const codes = new Set<string>();
  for (const c of String(p.location ?? "").split(/[,\s]+/)) if (/^[A-Z]{2}$/.test(c.trim().toUpperCase())) codes.add(c.trim().toUpperCase());
  for (const l of p.locationNetworkList ?? []) if (l.locationCode && /^[A-Z]{2}$/i.test(l.locationCode)) codes.add(l.locationCode.toUpperCase());
  return [...codes];
}

export async function syncTravelPackages(db: Db) {
  const r = await EsimAccess.packages();
  const list = r.packageList ?? [];
  console.log(`[esimaccess] packages=${list.length} sample=${JSON.stringify(list[0] ?? {}).slice(0, 400)}`);
  const now = new Date();
  const rows = list.filter((p) => p.packageCode && p.price > 0 && p.volume > 0 && p.duration > 0).map((p) => ({
    code: p.packageCode, slug: p.slug ?? null, name: String(p.name ?? p.packageCode).slice(0, 160), priceE4: Math.round(p.price),
    volumeBytes: Math.round(p.volume), duration: Math.round(p.duration), durationUnit: String(p.durationUnit ?? "DAY").toUpperCase(),
    locations: locationsOf(p), description: String(p.description ?? "").slice(0, 500), seenAt: now,
  })).filter((p) => p.locations.length > 0);
  if (!rows.length) throw new AppError(502, "PROVIDER_ERROR", "eSIM Access returned no packages.");
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 300) {
      await tx.insert(travelPackages).values(rows.slice(i, i + 300)).onConflictDoUpdate({
        target: travelPackages.code,
        set: { slug: sql`excluded.slug`, name: sql`excluded.name`, priceE4: sql`excluded.price_e4`, volumeBytes: sql`excluded.volume_bytes`, duration: sql`excluded.duration`, durationUnit: sql`excluded.duration_unit`, locations: sql`excluded.locations`, description: sql`excluded.description`, seenAt: now },
      });
    }
    await tx.delete(travelPackages).where(notInArray(travelPackages.code, rows.map((r) => r.code)));
  });
  const cfg = await getTravelConfig(db);
  await writeSetting(db, "travel_esim", { ...cfg, syncedAt: now.toISOString() });
  return { packages: rows.length };
}

function assertOpen(cfg: TravelConfig) {
  if (!esimAccessConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Travel eSIMs aren't available yet. Please check back soon.");
  if (!cfg.enabled) throw new AppError(503, "PAUSED", "Travel eSIMs are paused right now. Please check back soon.");
}

async function ensureSynced(db: Db, cfg: TravelConfig) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(travelPackages);
  if (n === 0 || !cfg.syncedAt || Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) {
    await syncTravelPackages(db).catch((e) => { if (n === 0) throw e; console.error("[esimaccess] sync failed", e); });
  }
}

const priceOf = (e4: number, rate: number, cfg: TravelConfig) => withMarkup(e4ToKobo(e4, rate), cfg.markupBps, 1000);

/** Countries with how many packages and the cheapest price. */
export async function travelDestinations(db: Db) {
  const cfg = await getTravelConfig(db);
  assertOpen(cfg);
  await ensureSynced(db, cfg);
  const rate = await getUsdRateKobo(db);
  if (!rate) throw new AppError(503, "NO_RATE", "Prices are being updated. Please try again in a few minutes.");
  const rows = await db.execute<{ code: string; n: number; min_e4: number }>(sql`
    select l as code, count(*)::int as n, min(price_e4)::int as min_e4
    from ${travelPackages}, unnest(${travelPackages.locations}) l
    where ${travelPackages.hidden} = false group by l`);
  return rows.rows.map((r) => ({ code: r.code, packages: r.n, fromKobo: priceOf(r.min_e4, rate, cfg) })).sort((a, b) => a.code.localeCompare(b.code));
}

function presentPackage(p: typeof travelPackages.$inferSelect, rate: number, cfg: TravelConfig) {
  return {
    code: p.code, name: p.name, data: dataSize(p.volumeBytes), days: durationLabel(p.duration, p.durationUnit), duration: p.duration,
    volume: p.volumeBytes, countries: p.locations.length, locations: p.locations.length <= 60 ? p.locations : [], priceKobo: priceOf(p.priceE4, rate, cfg),
  };
}

/** Packages that work in one country: single-country ones first, then regional/global. */
export async function travelPackagesFor(db: Db, country: string) {
  const cfg = await getTravelConfig(db);
  assertOpen(cfg);
  const rate = await getUsdRateKobo(db);
  const iso = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) throw badRequest("Pick a country.");
  const rows = await db.select().from(travelPackages)
    .where(and(eq(travelPackages.hidden, false), sql`${iso} = any(${travelPackages.locations})`))
    .orderBy(asc(travelPackages.volumeBytes), asc(travelPackages.duration));
  const list = rows.map((p) => presentPackage(p, rate, cfg));
  return { local: list.filter((p) => p.countries === 1), regional: list.filter((p) => p.countries > 1).sort((a, b) => a.priceKobo - b.priceKobo).slice(0, 40) };
}

/** Order one package. `expectedKobo` = the price the customer saw. */
export async function buyTravelEsim(db: Db, userId: string, code: string, expectedKobo: number) {
  const cfg = await getTravelConfig(db);
  assertOpen(cfg);
  const [p] = await db.select().from(travelPackages).where(eq(travelPackages.code, code));
  if (!p || p.hidden) throw notFound("Package");
  // Re-check the live price so we never sell below cost.
  const fresh = (await EsimAccess.packageByCode(code)).packageList?.find((x) => x.packageCode === code);
  if (!fresh) throw badRequest("That package isn't available any more. Please pick another.");
  if (Math.round(fresh.price) !== p.priceE4) await db.update(travelPackages).set({ priceE4: Math.round(fresh.price) }).where(eq(travelPackages.code, code));
  const rate = await getUsdRateKobo(db);
  const priceKobo = priceOf(Math.round(fresh.price), rate, cfg);
  if (priceKobo !== expectedKobo) throw new AppError(409, "PRICE_CHANGED", "The price just changed. Check the new price and try again.", { priceKobo });
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(travelEsimOrders).where(and(eq(travelEsimOrders.userId, userId), eq(travelEsimOrders.status, "pending")));
  if (busy.n >= 3) throw badRequest("You have 3 eSIMs still being prepared. Please wait a moment.");
  const label = `${p.name} · ${dataSize(p.volumeBytes)} · ${durationLabel(p.duration, p.durationUnit)}`;
  const order = await db.transaction(async (tx) => {
    const wallet = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, wallet, priceKobo, "travel_esim", { memo: `Travel eSIM: ${label}` });
    const [o] = await tx.insert(travelEsimOrders).values({ userId, packageCode: code, packageName: label, priceKobo, costE4: Math.round(fresh.price), holdId }).returning();
    await linkHold(tx, holdId, o.id);
    return o;
  });
  await sendTravelOrder(db, order.id);
  return presentOrder((await db.select().from(travelEsimOrders).where(eq(travelEsimOrders.id, order.id)))[0]);
}

/** Send (or re-send) an order to eSIM Access. Out of balance → it waits (money held) and the owner is emailed. */
async function sendTravelOrder(db: Db, id: string) {
  const [order] = await db.select().from(travelEsimOrders).where(eq(travelEsimOrders.id, id));
  if (!order || order.status !== "pending" || order.providerOrderNo) return;
  try {
    const r = await EsimAccess.order(order.id.replace(/-/g, ""), order.packageCode, order.costE4);
    console.log(`[esimaccess] order ${order.publicId} orderNo=${r.orderNo}`);
    if (!r.orderNo) throw new AppError(502, "PROVIDER_ERROR", "No order number returned", { definite: true });
    await db.update(travelEsimOrders).set({ providerOrderNo: r.orderNo, waitingFunds: false, error: null, updatedAt: new Date() }).where(eq(travelEsimOrders.id, order.id));
    await refreshTravelOrder(db, order.id).catch((e) => console.error("[esimaccess] first query", e));
  } catch (e) {
    if (isOutOfFunds((e as Error).message)) {
      await db.update(travelEsimOrders).set({ waitingFunds: true, error: "Waiting for eSIM Access balance", updatedAt: new Date() }).where(eq(travelEsimOrders.id, order.id));
      await alertSupplierFunds(db, "eSIM Access", { adminPath: "/admin/instant" });
      if (!order.waitingFunds) alertCustomer(db, order.userId, `Travel eSIM order #${order.publicId} is pending`, [`Your ${order.packageName} eSIM order has been received.`, PENDING_LINE]);
      return;
    }
    // eSIM Access answers with { success: false } for refusals (price changed, unavailable): definite failures.
    const definite = e instanceof AppError && e.code === "PROVIDER_ERROR";
    if (definite) {
      await closeTravel(db, order.id, "failed", { error: (e as Error).message });
      if (!order.waitingFunds) throw new AppError(502, "PROVIDER_ERROR", "We couldn't get that eSIM right now. You have not been charged. Please try again shortly or pick another package.");
      return;
    }
    if (order.waitingFunds) return; // network trouble: try again next run
    console.error("[esimaccess] order unclear", order.id, e);
    await db.update(travelEsimOrders).set({ error: "Checking with the provider", updatedAt: new Date() }).where(eq(travelEsimOrders.id, order.id));
  }
}

async function closeTravel(db: Db, id: string, status: "delivered" | "refunded" | "failed", extra: { lpa?: string; iccid?: string; esimTranNo?: string; error?: string } = {}) {
  const changed = { v: false };
  const res = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(travelEsimOrders).where(eq(travelEsimOrders.id, id)).for("update");
    if (!o || o.status !== "pending") return o;
    const capture = status === "delivered" ? o.priceKobo : 0;
    const platform = capture ? await platformWalletId(tx) : null;
    await settleHold(tx, o.holdId, capture, platform ? [{ walletId: platform, amount: capture, kind: "revenue:travel_esim" }] : [], {
      refType: "travel_esim", refId: o.id, idempotencyKey: `travel:${o.id}:settle`,
    });
    const [u] = await tx.update(travelEsimOrders).set({
      status, lpa: extra.lpa ?? o.lpa, iccid: extra.iccid ?? o.iccid, esimTranNo: extra.esimTranNo ?? o.esimTranNo,
      error: status === "delivered" ? null : extra.error ?? o.error, updatedAt: new Date(),
    }).where(eq(travelEsimOrders.id, id)).returning();
    changed.v = true;
    return u;
  });
  if (changed.v && res) {
    if (status === "delivered") alertCustomer(db, res.userId, `Your travel eSIM is ready`, [`Your ${res.packageName} eSIM (order #${res.publicId}) is ready to install. Open your account to scan the QR code.`, "Install it before you travel, while you have Wi-Fi."], "esim");
    else alertCustomer(db, res.userId, `Travel eSIM order #${res.publicId} refunded`, [`We couldn't deliver your ${res.packageName} eSIM, so ${alertNaira(res.priceKobo)} is back in your wallet.`], "wallet");
  }
  return res;
}

export async function refreshTravelOrder(db: Db, id: string) {
  const [o] = await db.select().from(travelEsimOrders).where(eq(travelEsimOrders.id, id));
  if (!o || o.status !== "pending") return o;
  if (o.waitingFunds && !o.providerOrderNo) {
    await sendTravelOrder(db, id);
    return (await db.select().from(travelEsimOrders).where(eq(travelEsimOrders.id, id)))[0];
  }
  if (!o.providerOrderNo) {
    // Order call never confirmed. Give up (refund) after 30 minutes; the admin can check eSIM Access for a stray order.
    if (Date.now() - o.createdAt.getTime() > 30 * 60_000) return closeTravel(db, id, "refunded", { error: "Provider never confirmed the order. Check eSIM Access for a stray order." });
    return o;
  }
  const list = (await EsimAccess.query(o.providerOrderNo)).esimList ?? [];
  const e = list.find((x) => x.ac) ?? list[0];
  if (e?.ac) return closeTravel(db, id, "delivered", { lpa: e.ac, iccid: e.iccid, esimTranNo: e.esimTranNo });
  if (e && /CANCEL|REVOKE|FAIL/i.test(`${e.esimStatus ?? ""} ${e.smdpStatus ?? ""}`)) return closeTravel(db, id, "refunded", { error: `Provider status: ${e.esimStatus}` });
  return o;
}

async function qr(lpa: string) {
  return `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(lpa, { type: "svg", margin: 1, errorCorrectionLevel: "M" })).toString("base64")}`;
}

async function presentOrder(o: typeof travelEsimOrders.$inferSelect) {
  const delivered = o.status === "delivered" && o.lpa;
  return {
    id: o.id, publicId: o.publicId, label: o.packageName, priceKobo: o.priceKobo, status: o.status, waiting: o.status === "pending" && o.waitingFunds, createdAt: o.createdAt,
    lpa: delivered ? o.lpa : null, qr: delivered ? await qr(o.lpa!) : null, iccid: delivered ? o.iccid : null, hasUsage: Boolean(delivered && o.esimTranNo),
  };
}

export async function myTravelOrders(db: Db, userId: string) {
  const rows = await db.select().from(travelEsimOrders).where(eq(travelEsimOrders.userId, userId)).orderBy(desc(travelEsimOrders.createdAt)).limit(20);
  return Promise.all(rows.map(presentOrder));
}

export async function myTravelOrder(db: Db, userId: string, id: string) {
  const [o] = await db.select().from(travelEsimOrders).where(and(eq(travelEsimOrders.id, id), eq(travelEsimOrders.userId, userId)));
  if (!o) throw notFound("eSIM");
  if (o.status !== "pending") return presentOrder(o);
  const u = await refreshTravelOrder(db, id).catch((e) => { console.error("[esimaccess] refresh", e); return o; });
  return presentOrder(u ?? o);
}

/** Data used / total for a delivered eSIM. */
export async function myTravelUsage(db: Db, userId: string, id: string) {
  const [o] = await db.select().from(travelEsimOrders).where(and(eq(travelEsimOrders.id, id), eq(travelEsimOrders.userId, userId)));
  if (!o || o.status !== "delivered" || !o.esimTranNo) throw notFound("eSIM");
  const r = await EsimAccess.usage(o.esimTranNo);
  const u = (r.esimUsageList ?? []).find((x) => x.esimTranNo === o.esimTranNo) ?? r.esimUsageList?.[0];
  return { used: u?.dataUsage ?? null, total: u?.totalData ?? null };
}

export async function sweepTravelOrders(db: Db) {
  if (!esimAccessConfigured()) return { checked: 0 };
  const pending = await db.select({ id: travelEsimOrders.id }).from(travelEsimOrders).where(eq(travelEsimOrders.status, "pending")).orderBy(asc(travelEsimOrders.createdAt)).limit(20);
  for (const p of pending) await refreshTravelOrder(db, p.id).catch((e) => console.error("[esimaccess] sweep", p.id, e));
  const cfg = await getTravelConfig(db);
  if (cfg.enabled && cfg.syncedAt && Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) await syncTravelPackages(db).catch((e) => console.error("[esimaccess] sync", e));
  return { checked: pending.length };
}

/* ---------- Admin ---------- */

export async function travelAdminOverview(db: Db, q?: string) {
  const cfg = await getTravelConfig(db);
  const configured = esimAccessConfigured();
  const rate = await getUsdRateKobo(db);
  const balance = configured ? await EsimAccess.balance().then((b) => ({ usd: b.balance / 10_000, error: null }), (e: Error) => ({ usd: null, error: e.message })) : null;
  const [stats] = await db.select({
    delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
    refunded: sql<number>`count(*) filter (where status in ('refunded','failed'))::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    revenueKobo: sql<number>`coalesce(sum(price_kobo) filter (where status = 'delivered'), 0)::bigint`,
    costE4: sql<number>`coalesce(sum(cost_e4) filter (where status = 'delivered'), 0)::bigint`,
  }).from(travelEsimOrders);
  const recent = await db.select({ o: travelEsimOrders, email: users.email }).from(travelEsimOrders).innerJoin(users, eq(users.id, travelEsimOrders.userId)).orderBy(desc(travelEsimOrders.createdAt)).limit(30);
  const like = q?.trim() ? `%${q.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
  const iso = q?.trim().length === 2 ? q.trim().toUpperCase() : null;
  const pkgs = await db.select().from(travelPackages)
    .where(like ? or(ilike(travelPackages.name, like), ilike(travelPackages.code, like), iso ? sql`${iso} = any(${travelPackages.locations})` : undefined) : undefined)
    .orderBy(asc(travelPackages.name)).limit(60);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(travelPackages);
  return {
    config: cfg, configured, balance, usdRateKobo: rate, totalPackages: total,
    stats: { ...stats, revenueKobo: Number(stats.revenueKobo), costKobo: e4ToKobo(Number(stats.costE4), rate) },
    recent: recent.map(({ o, email }) => ({
      id: o.id, publicId: o.publicId, label: o.packageName, priceKobo: o.priceKobo, costKobo: e4ToKobo(o.costE4, rate), status: o.status,
      error: o.error, orderNo: o.providerOrderNo, iccid: o.iccid, email, createdAt: o.createdAt,
    })),
    packages: pkgs.map((p) => ({ ...presentPackage(p, rate, cfg), hidden: p.hidden, costKobo: e4ToKobo(p.priceE4, rate) })),
  };
}

export async function setTravelHidden(db: Db, codes: string[], hidden: boolean) {
  if (!codes.length) return { updated: 0 };
  const r = await db.update(travelPackages).set({ hidden }).where(inArray(travelPackages.code, codes)).returning({ code: travelPackages.code });
  return { updated: r.length };
}

export async function adminRefundTravel(db: Db, id: string) {
  const o = await refreshTravelOrder(db, id).catch(() => null);
  if (o && o.status !== "pending") return { status: o.status };
  const u = await closeTravel(db, id, "refunded", { error: "Refunded by admin" });
  return { status: u?.status };
}
