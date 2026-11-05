/**
 * Nigerian airtime and data through Reloadly. Operators (MTN, Airtel, Glo, 9mobile, and their data operators)
 * are cached for 6 hours. Pay-on-delivery: hold → top-up → capture when Reloadly says SUCCESSFUL, release if it fails.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { costToKobo, networkOf, ngPhone, withMarkup, NG_NETWORKS, type NgNetwork } from "@/core/instant";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { topupOrders, users } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { getUsdRateKobo } from "./pricing";
import { ReloadlyTopup, adminReason, reloadlyConfigured, reloadlyMode, type RlOperator, type RlTopup } from "./reloadly";
import { alertSupplierFunds, isOutOfFunds } from "./supplierFunds";
import { alertCustomer, alertNaira, PENDING_LINE } from "./customerAlerts";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

export type AirtimeConfig = { airtimeMarkupBps: number; dataMarkupBps: number; enabled: boolean };
const DEFAULTS: AirtimeConfig = { airtimeMarkupBps: 0, dataMarkupBps: 0, enabled: true };
const OPS_TTL_MS = 6 * 3600_000;
const MIN_AIRTIME = 50, MAX_AIRTIME = 50_000; // Naira

export const getAirtimeConfig = (db: Db) => readSetting(db, "airtime", DEFAULTS);

export async function updateAirtimeConfig(db: Db, input: Partial<AirtimeConfig>) {
  const cfg = await getAirtimeConfig(db);
  for (const k of ["airtimeMarkupBps", "dataMarkupBps"] as const) {
    const v = input[k];
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > 100_000)) throw badRequest("Markup must be between 0% and 1000%.");
  }
  return writeSetting(db, "airtime", { ...cfg, ...input });
}

/** One Reloadly operator, reduced to what we need. Amounts: "send" = what Reloadly charges, "local" = Naira delivered. */
export type Operator = {
  id: number; name: string; network: NgNetwork; data: boolean;
  sendCurrency: string; fxRate: number; type: "FIXED" | "RANGE";
  min: number | null; max: number | null;              // RANGE, send currency
  plans: { send: number; local: number | null; label: string }[]; // FIXED
};

const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

function describe(map: unknown, amount: number): string | null {
  if (!map || typeof map !== "object") return null;
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) if (Math.abs(Number(k) - amount) < 1e-6 && typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function parseOperator(o: RlOperator): Operator | null {
  const id = n(o.operatorId ?? o.id);
  const name = String(o.name ?? "");
  const network = networkOf(name);
  if (!Number.isInteger(id) || !network) return null;
  const sendCurrency = String(o.senderCurrencyCode ?? "").toUpperCase();
  const fx = n((o.fx as { rate?: unknown } | undefined)?.rate);
  const type = String(o.denominationType ?? "").toUpperCase() === "RANGE" ? "RANGE" : "FIXED";
  const data = o.data === true || o.bundle === true || /data|bundle/i.test(name);
  const fixed = Array.isArray(o.fixedAmounts) ? o.fixedAmounts.map(n) : [];
  const localFixed = Array.isArray(o.localFixedAmounts) ? o.localFixedAmounts.map(n) : [];
  const plans = type === "FIXED"
    ? fixed.map((send, i) => {
      const local = localFixed.length === fixed.length && localFixed[i] > 0 ? localFixed[i] : sendCurrency === "NGN" ? send : null;
      const label = (local !== null ? describe(o.localFixedAmountsDescriptions, local) : null) ?? describe(o.fixedAmountsDescriptions, send)
        ?? (local !== null ? `₦${local.toLocaleString("en-NG")} ${data ? "data" : "airtime"}` : `${send} ${sendCurrency}`);
      return { send, local, label: label.slice(0, 120) };
    }).filter((p) => p.send > 0)
    : [];
  if (!sendCurrency || (type === "FIXED" && plans.length === 0)) return null;
  return {
    id, name, network, data, sendCurrency, fxRate: fx > 0 ? fx : sendCurrency === "NGN" ? 1 : 0, type,
    min: type === "RANGE" && n(o.minAmount) > 0 ? n(o.minAmount) : null,
    max: type === "RANGE" && n(o.maxAmount) > 0 ? n(o.maxAmount) : null,
    plans,
  };
}

async function operators(db: Db, force = false): Promise<Operator[]> {
  const cached = await readSetting<{ fetchedAt: string | null; list: Operator[] }>(db, "airtime_operators", { fetchedAt: null, list: [] });
  if (!force && cached.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < OPS_TTL_MS && cached.list.length) return cached.list;
  try {
    const raw = await ReloadlyTopup.operators("NG");
    const list = (Array.isArray(raw) ? raw : raw.content ?? []);
    console.log(`[airtime] NG operators=${list.length} names=${list.map((o) => `${o.name}#${o.operatorId ?? o.id}/${o.denominationType}/${o.senderCurrencyCode}`).join("; ").slice(0, 600)}`);
    const parsed = list.map(parseOperator).filter((x): x is Operator => Boolean(x));
    if (!parsed.length) throw new AppError(502, "PROVIDER_ERROR", "Reloadly returned no Nigerian networks.");
    await writeSetting(db, "airtime_operators", { fetchedAt: new Date().toISOString(), list: parsed });
    return parsed;
  } catch (e) {
    if (cached.list.length) { console.error("[airtime] refresh failed, using cached", e); return cached.list; }
    throw e;
  }
}

function assertOpen(cfg: AirtimeConfig) {
  if (!reloadlyConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Airtime and data aren't available yet. Please check back soon.");
  if (!cfg.enabled) throw new AppError(503, "PAUSED", "Airtime and data are paused right now. Please check back soon.");
}

/** Naira delivered → amount we send to Reloadly (its currency). */
function sendFor(op: Operator, local: number): number {
  if (op.sendCurrency === "NGN") return local;
  if (!(op.fxRate > 0)) throw new AppError(503, "NO_RATE", "This network can't be priced right now.");
  return Math.ceil((local / op.fxRate) * 100) / 100;
}

function price(op: Operator, send: number, cfg: AirtimeConfig, rate: number) {
  const kobo = costToKobo(send, op.sendCurrency, rate);
  if (!kobo) return null;
  return withMarkup(kobo, op.data ? cfg.dataMarkupBps : cfg.airtimeMarkupBps, 100);
}

/** What the customer can buy, per network. */
export async function airtimeCatalog(db: Db) {
  const cfg = await getAirtimeConfig(db);
  assertOpen(cfg);
  const [ops, rate] = await Promise.all([operators(db), getUsdRateKobo(db)]);
  return NG_NETWORKS.map((network) => {
    const mine = ops.filter((o) => o.network === network);
    const air = mine.find((o) => !o.data && o.type === "RANGE") ?? mine.find((o) => !o.data);
    let airtime: { operatorId: number; min: number; max: number; per1000Kobo: number } | { operatorId: number; plans: { send: number; label: string; priceKobo: number }[] } | null = null;
    if (air?.type === "RANGE") {
      const min = Math.max(MIN_AIRTIME, Math.ceil((air.min ?? 0) * (air.sendCurrency === "NGN" ? 1 : air.fxRate)));
      const max = Math.min(MAX_AIRTIME, Math.floor((air.max ?? MAX_AIRTIME) * (air.sendCurrency === "NGN" ? 1 : air.fxRate)) || MAX_AIRTIME);
      // Price of ₦1,000 tells the page roughly what any amount costs; the exact price comes from /quote.
      const p1000 = price(air, sendFor(air, 1000), cfg, rate) ?? 0;
      airtime = { operatorId: air.id, min, max, per1000Kobo: p1000 };
    } else if (air) {
      airtime = { operatorId: air.id, plans: air.plans.map((p) => ({ send: p.send, label: p.label, priceKobo: price(air, p.send, cfg, rate) ?? 0 })).filter((p) => p.priceKobo > 0) };
    }
    const data = mine.filter((o) => o.data && o.type === "FIXED").flatMap((o) =>
      o.plans.map((p) => ({ operatorId: o.id, group: o.name.replace(/nigeria/i, "").replace(/\s+/g, " ").trim(), send: p.send, label: p.label, priceKobo: price(o, p.send, cfg, rate) ?? 0 })))
      .filter((p) => p.priceKobo > 0).sort((a, b) => a.priceKobo - b.priceKobo);
    return { network, airtime, data };
  }).filter((x) => x.airtime || x.data.length);
}

export async function airtimeQuote(db: Db, input: { operatorId: number; naira?: number; send?: number }) {
  const cfg = await getAirtimeConfig(db);
  assertOpen(cfg);
  const [ops, rate] = await Promise.all([operators(db), getUsdRateKobo(db)]);
  const op = ops.find((o) => o.id === input.operatorId);
  if (!op) throw badRequest("That network isn't available right now. Please refresh.");
  let send: number, description: string;
  if (op.type === "RANGE") {
    const naira = Math.round(input.naira ?? 0);
    if (!(naira >= MIN_AIRTIME && naira <= MAX_AIRTIME)) throw badRequest(`Enter an amount between ₦${MIN_AIRTIME} and ₦${MAX_AIRTIME.toLocaleString("en-NG")}.`);
    send = sendFor(op, naira);
    if ((op.min !== null && send < op.min) || (op.max !== null && send > op.max)) throw badRequest("That amount isn't available on this network. Try a different amount.");
    description = `₦${naira.toLocaleString("en-NG")} ${op.network} ${op.data ? "data" : "airtime"}`;
  } else {
    const plan = op.plans.find((p) => Math.abs(p.send - (input.send ?? -1)) < 1e-6);
    if (!plan) throw badRequest("That plan isn't available any more. Please pick another.");
    send = plan.send;
    description = `${op.network} ${plan.label}`;
  }
  const priceKobo = price(op, send, cfg, rate);
  if (!priceKobo) throw new AppError(503, "NO_RATE", "Prices are being updated. Please try again in a few minutes.");
  return { op, send, description, priceKobo };
}

export async function buyTopup(db: Db, userId: string, input: { operatorId: number; naira?: number; send?: number; phone: string; priceKobo: number }) {
  const phone = ngPhone(input.phone);
  if (!phone) throw badRequest("Enter a valid Nigerian phone number, e.g. 0803 123 4567.");
  const q = await airtimeQuote(db, input);
  if (q.priceKobo !== input.priceKobo) throw new AppError(409, "PRICE_CHANGED", "The price just changed. Check the new price and try again.", { priceKobo: q.priceKobo });
  const [busy] = await db.select({ n: sql<number>`count(*)::int` }).from(topupOrders).where(and(eq(topupOrders.userId, userId), eq(topupOrders.status, "pending")));
  if (busy.n >= 3) throw badRequest("You have 3 top-ups still processing. Please wait a moment.");
  const order = await db.transaction(async (tx) => {
    const wallet = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, wallet, q.priceKobo, "airtime", { memo: `${q.description} to ${phone}` });
    const [o] = await tx.insert(topupOrders).values({
      userId, kind: q.op.data ? "data" : "airtime", network: q.op.network, operatorId: q.op.id, phone, description: q.description,
      sendAmount: String(q.send), sendCurrency: q.op.sendCurrency, priceKobo: q.priceKobo, holdId,
    }).returning();
    await linkHold(tx, holdId, o.id);
    return o;
  });
  await sendTopup(db, order.id);
  const [o] = await db.select().from(topupOrders).where(eq(topupOrders.id, order.id));
  return present(o);
}

/** Send (or re-send) a top-up. Out of Reloadly balance → it waits (money held) and the owner is emailed. */
async function sendTopup(db: Db, id: string) {
  const [order] = await db.select().from(topupOrders).where(eq(topupOrders.id, id));
  if (!order || order.status !== "pending" || order.providerTx) return;
  try {
    const r = await ReloadlyTopup.topup({ operatorId: order.operatorId, amount: Number(order.sendAmount), customIdentifier: order.id, phone: order.phone });
    console.log(`[airtime] order ${order.publicId} tx=${r.transactionId} status=${r.status}`);
    await db.update(topupOrders).set({ waitingFunds: false, error: null }).where(eq(topupOrders.id, id));
    await applyResult(db, order.id, r);
  } catch (e) {
    const status = e instanceof AppError ? (e.details as { status?: number } | undefined)?.status : undefined;
    if (isOutOfFunds((e as Error).message)) {
      await db.update(topupOrders).set({ waitingFunds: true, error: "Waiting for Reloadly balance", updatedAt: new Date() }).where(eq(topupOrders.id, id));
      await alertSupplierFunds(db, "Reloadly", { adminPath: "/admin/instant" });
      if (!order.waitingFunds) alertCustomer(db, order.userId, `${order.description} for ${order.phone} is pending`, [`Your ${order.description} for ${order.phone} has been received.`, PENDING_LINE]);
      return;
    }
    if (order.waitingFunds && status && status >= 500) return;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      await closeTopup(db, order.id, "failed", (e as Error).message);
      if (!order.waitingFunds) throw new AppError(502, "PROVIDER_ERROR", `The top-up didn't go through (${(e as Error).message}). You have not been charged.`);
      return;
    }
    console.error("[airtime] top-up unclear", order.id, e);
    await db.update(topupOrders).set({ waitingFunds: false, error: "Checking with the network", updatedAt: new Date() }).where(eq(topupOrders.id, order.id));
  }
}

async function applyResult(db: Db, id: string, r: RlTopup | null) {
  if (!r) return;
  if (r.transactionId) await db.update(topupOrders).set({ providerTx: String(r.transactionId), updatedAt: new Date() }).where(eq(topupOrders.id, id));
  const st = String(r.status ?? "").toUpperCase();
  if (st === "SUCCESSFUL" || st === "SUCCESS") return closeTopup(db, id, "delivered");
  if (st === "FAILED" || st === "REFUNDED") return closeTopup(db, id, "refunded", `Network status: ${st.toLowerCase()}`);
}

async function closeTopup(db: Db, id: string, status: "delivered" | "refunded" | "failed", error?: string) {
  const changed = { v: false };
  const res = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(topupOrders).where(eq(topupOrders.id, id)).for("update");
    if (!o || o.status !== "pending") return o;
    const capture = status === "delivered" ? o.priceKobo : 0;
    const platform = capture ? await platformWalletId(tx) : null;
    await settleHold(tx, o.holdId, capture, platform ? [{ walletId: platform, amount: capture, kind: "revenue:airtime" }] : [], {
      refType: "airtime", refId: o.id, idempotencyKey: `topup:${o.id}:settle`,
    });
    const [u] = await tx.update(topupOrders).set({ status, error: status === "delivered" ? null : error ?? o.error, updatedAt: new Date() }).where(eq(topupOrders.id, id)).returning();
    changed.v = true;
    return u;
  });
  if (changed.v && res) {
    if (status === "delivered") alertCustomer(db, res.userId, `${res.description} sent to ${res.phone}`, [`Your ${res.description} for ${res.phone} has been delivered. ${alertNaira(res.priceKobo)} was charged.`], "airtime");
    else alertCustomer(db, res.userId, `${res.description} refunded`, [`We couldn't deliver ${res.description} to ${res.phone}, so ${alertNaira(res.priceKobo)} is back in your wallet.`], "wallet");
  }
  return res;
}

export async function refreshTopup(db: Db, id: string) {
  const [o] = await db.select().from(topupOrders).where(eq(topupOrders.id, id));
  if (!o || o.status !== "pending") return o;
  if (o.waitingFunds) {
    await sendTopup(db, id);
  } else if (o.providerTx) {
    const s = await ReloadlyTopup.status(o.providerTx);
    await applyResult(db, id, { ...(s.transaction ?? {}), status: s.status ?? s.transaction?.status, transactionId: Number(o.providerTx) });
  } else {
    const found = await ReloadlyTopup.findByCustomId(o.id);
    if (found) await applyResult(db, id, { ...found, status: found.status ?? "SUCCESSFUL" });
    else if (Date.now() - o.createdAt.getTime() > 10 * 60_000) await closeTopup(db, id, "refunded", "The network never received the top-up.");
  }
  const [u] = await db.select().from(topupOrders).where(eq(topupOrders.id, id));
  return u;
}

function present(o: typeof topupOrders.$inferSelect) {
  return { id: o.id, publicId: o.publicId, kind: o.kind, network: o.network, phone: o.phone, description: o.description, priceKobo: o.priceKobo, status: o.status, waiting: o.status === "pending" && o.waitingFunds, createdAt: o.createdAt };
}

export async function myTopups(db: Db, userId: string) {
  const rows = await db.select().from(topupOrders).where(eq(topupOrders.userId, userId)).orderBy(desc(topupOrders.createdAt)).limit(20);
  return rows.map(present);
}

export async function myTopup(db: Db, userId: string, id: string) {
  const [o] = await db.select().from(topupOrders).where(and(eq(topupOrders.id, id), eq(topupOrders.userId, userId)));
  if (!o) throw notFound("Top-up");
  if (o.status !== "pending") return present(o);
  const u = await refreshTopup(db, id).catch((e) => { console.error("[airtime] refresh", e); return o; });
  return present(u ?? o);
}

export async function sweepTopups(db: Db) {
  if (!reloadlyConfigured()) return { checked: 0 };
  const pending = await db.select({ id: topupOrders.id }).from(topupOrders).where(eq(topupOrders.status, "pending")).orderBy(asc(topupOrders.createdAt)).limit(30);
  for (const p of pending) await refreshTopup(db, p.id).catch((e) => console.error("[airtime] sweep", p.id, e));
  return { checked: pending.length };
}

/* ---------- Admin ---------- */

export async function airtimeAdminOverview(db: Db) {
  const cfg = await getAirtimeConfig(db);
  const configured = reloadlyConfigured();
  const balance = configured ? await ReloadlyTopup.balance().then((b) => ({ amount: b.balance, currency: b.currencyCode, error: null }), (e: Error) => ({ amount: null, currency: null, error: adminReason(e) })) : null;
  const ops = configured ? await operators(db).catch(() => [] as Operator[]) : [];
  const [stats] = await db.select({
    delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
    refunded: sql<number>`count(*) filter (where status in ('refunded','failed'))::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    revenueKobo: sql<number>`coalesce(sum(price_kobo) filter (where status = 'delivered'), 0)::bigint`,
  }).from(topupOrders);
  const recent = await db.select({ o: topupOrders, email: users.email }).from(topupOrders).innerJoin(users, eq(users.id, topupOrders.userId)).orderBy(desc(topupOrders.createdAt)).limit(30);
  return {
    config: cfg, configured, mode: reloadlyMode(), balance,
    operators: ops.map((o) => ({ id: o.id, name: o.name, network: o.network, data: o.data, type: o.type, currency: o.sendCurrency, plans: o.plans.length })),
    stats: { ...stats, revenueKobo: Number(stats.revenueKobo) },
    recent: recent.map(({ o, email }) => ({
      id: o.id, publicId: o.publicId, description: o.description, phone: o.phone, cost: `${o.sendAmount} ${o.sendCurrency}`, priceKobo: o.priceKobo,
      status: o.status, error: o.error, email, createdAt: o.createdAt,
    })),
  };
}

export async function refreshOperators(db: Db) {
  const list = await operators(db, true);
  return { operators: list.length };
}

export async function adminRefundTopup(db: Db, id: string) {
  const o = await refreshTopup(db, id).catch(() => null);
  if (o && o.status !== "pending") return { status: o.status };
  const u = await closeTopup(db, id, "refunded", "Refunded by admin");
  return { status: u?.status };
}
