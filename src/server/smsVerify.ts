/**
 * "Get Verification Code": rent a one-time number from TextVerified, show the SMS code.
 * Pay-on-delivery: the price is held when the number is rented, captured when a code
 * arrives, and released (refunded) if no code comes or the customer cancels.
 */
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { extractCode, outcomeFor, sellPriceKobo, serviceLabel, usdToMilli } from "@/core/smsVerify";
import type { Db, DbOrTx } from "./db";
import { appSettings, smsServices, smsVerifications, users } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { getUsdRateKobo } from "./pricing";
import { TextVerified, textVerifiedConfigured } from "./textverified";
import { alertSupplierFunds, isOutOfFunds } from "./supplierFunds";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

export type VerifyConfig = { markupBps: number; enabled: boolean; syncedAt: string | null };
const DEFAULT_CONFIG: VerifyConfig = { markupBps: 30_000, enabled: true, syncedAt: null };
const PRICE_TTL_MS = 15 * 60_000;
const SYNC_EVERY_MS = 24 * 3600_000;

/** Shown first in the list. Matched against the provider's service names. */
const POPULAR = ["whatsapp", "telegram", "google", "gmail", "facebook", "instagram", "tiktok", "twitter", "x", "snapchat", "discord", "microsoft", "apple", "amazon", "paypal", "uber", "tinder", "linkedin", "signal", "openai", "chatgpt", "yahoo"];

export async function getVerifyConfig(db: DbOrTx): Promise<VerifyConfig> {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "sms_verify"));
  return { ...DEFAULT_CONFIG, ...((r?.value as Partial<VerifyConfig>) ?? {}) };
}

async function saveVerifyConfig(db: DbOrTx, cfg: VerifyConfig) {
  await db.insert(appSettings).values({ key: "sms_verify", value: cfg })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: cfg, updatedAt: new Date() } });
}

export async function updateVerifyConfig(db: Db, input: { markupBps?: number; enabled?: boolean }) {
  const cfg = await getVerifyConfig(db);
  if (input.markupBps !== undefined && (!Number.isInteger(input.markupBps) || input.markupBps < 0 || input.markupBps > 100_000)) {
    throw badRequest("Markup must be between 0% and 1000%.");
  }
  const next = { ...cfg, ...input };
  await saveVerifyConfig(db, next);
  // Cached sell prices depend on the markup; they are computed on read, so nothing else to update.
  return next;
}

/** Pull the provider's service list (names only; prices are fetched when a customer opens one). */
export async function syncSmsServices(db: Db) {
  type Raw = { serviceName: string; capability?: string; description?: string; refundability?: string };
  // SMS-capable, refundable (we refund customers when no code comes), and not the free-text "service not listed".
  const pick = (list: Raw[]) => {
    const out = new Map<string, string>();
    for (const s of list) {
      const name = s.serviceName.trim();
      if (!name || /^servicenotlisted/i.test(name)) continue;
      if (s.capability && !/sms/i.test(s.capability)) continue;
      if (s.refundability && /non/i.test(s.refundability)) continue;
      const label = (s.description ?? "").trim();
      if (!out.has(name) || (label && label !== name)) out.set(name, label && label !== name ? label.slice(0, 80) : out.get(name) ?? "");
    }
    return out;
  };
  let found = pick(await TextVerified.services("mobile"));
  if (found.size === 0) found = pick(await TextVerified.services());
  const names = [...found.keys()];
  if (names.length === 0) throw new AppError(502, "PROVIDER_ERROR", "The provider returned no services.");
  const now = new Date();
  await db.transaction(async (tx) => {
    for (let i = 0; i < names.length; i += 500) {
      await tx.insert(smsServices).values(names.slice(i, i + 500).map((name) => ({ name, label: found.get(name) || null, seenAt: now })))
        .onConflictDoUpdate({ target: smsServices.name, set: { seenAt: now, label: sql`excluded.label` } });
    }
    await tx.delete(smsServices).where(notInArray(smsServices.name, names));
  });
  const cfg = await getVerifyConfig(db);
  await saveVerifyConfig(db, { ...cfg, syncedAt: now.toISOString() });
  return { services: names.length };
}

async function ensureSynced(db: Db) {
  const cfg = await getVerifyConfig(db);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(smsServices);
  if (n === 0 || !cfg.syncedAt || Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) {
    await syncSmsServices(db).catch((e) => { if (n === 0) throw e; console.error("[verify] sync failed", e); });
  }
}

function assertOpen(cfg: VerifyConfig) {
  if (!textVerifiedConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Verification codes aren't available yet. Please check back soon.");
  if (!cfg.enabled) throw new AppError(503, "PAUSED", "Verification codes are paused right now. Please check back soon.");
}

/** Services customers can pick, popular first. Price shows when it's been looked up recently. */
export async function listSmsServices(db: Db, q?: string) {
  const cfg = await getVerifyConfig(db);
  assertOpen(cfg);
  await ensureSynced(db);
  const rate = await getUsdRateKobo(db);
  const filters = [eq(smsServices.hidden, false)];
  if (q && q.trim().length >= 1) {
    const like = `%${q.trim().replace(/[%_\\]/g, "\\$&").replace(/\s+/g, "%")}%`;
    filters.push(or(ilike(smsServices.name, like), ilike(smsServices.label, like))!);
  }
  const rows = await db.select().from(smsServices).where(and(...filters)).orderBy(asc(smsServices.name));
  const rank = (n: string) => { const i = POPULAR.indexOf(n.toLowerCase()); return i === -1 ? 999 : i; };
  rows.sort((a, b) => rank(a.name) - rank(b.name) || (a.label || a.name).localeCompare(b.label || b.name, "en", { sensitivity: "base" }));
  return rows.map((r) => ({
    name: r.name,
    label: r.label || serviceLabel(r.name),
    popular: rank(r.name) < 999,
    fixed: Boolean(r.fixedPriceKobo),
    priceKobo: r.fixedPriceKobo ? r.fixedPriceKobo : r.costUsdMilli && r.pricedAt && Date.now() - r.pricedAt.getTime() < 6 * 3600_000 ? sellPriceKobo(r.costUsdMilli, rate, cfg.markupBps) : null,
  }));
}

/** Current price for one service (fresh from the provider every 15 minutes). */
export async function quoteSmsService(db: Db, name: string) {
  const cfg = await getVerifyConfig(db);
  assertOpen(cfg);
  const [s] = await db.select().from(smsServices).where(eq(smsServices.name, name));
  if (!s || s.hidden) throw notFound("Service");
  let costMilli = s.costUsdMilli;
  if (!costMilli || !s.pricedAt || Date.now() - s.pricedAt.getTime() > PRICE_TTL_MS) {
    const p = await TextVerified.price(name);
    costMilli = usdToMilli(Number(p.price));
    await db.update(smsServices).set({ costUsdMilli: costMilli, pricedAt: new Date() }).where(eq(smsServices.name, name));
  }
  const rate = await getUsdRateKobo(db);
  if (!rate && !s.fixedPriceKobo) throw new AppError(503, "NO_RATE", "Prices are being updated. Please try again in a few minutes.");
  const priceKobo = s.fixedPriceKobo || sellPriceKobo(costMilli, rate, cfg.markupBps);
  return { name, label: s.label || serviceLabel(name), priceKobo, costMilli, fixed: Boolean(s.fixedPriceKobo) };
}

/** Rent a number. `expectedKobo` is the price the customer saw; if it moved, they confirm again. */
export async function startVerification(db: Db, userId: string, name: string, expectedKobo: number) {
  const [busy] = await db.select({ id: smsVerifications.id }).from(smsVerifications)
    .where(and(eq(smsVerifications.userId, userId), eq(smsVerifications.status, "pending"))).limit(1);
  if (busy) throw badRequest("You already have a number waiting for a code. Finish or cancel it first.");
  const q = await quoteSmsService(db, name);
  if (q.priceKobo !== expectedKobo) {
    throw new AppError(409, "PRICE_CHANGED", "The price just changed. Check the new price and try again.", { priceKobo: q.priceKobo });
  }
  const [v] = await db.transaction(async (tx) => {
    const wallet = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, wallet, q.priceKobo, "sms_verify", { memo: `Verification code: ${q.label}` });
    const row = await tx.insert(smsVerifications).values({ userId, serviceName: name, label: q.label, priceKobo: q.priceKobo, costUsdMilli: q.costMilli, holdId }).returning();
    await linkHold(tx, holdId, row[0].id);
    return row;
  });
  try {
    // maxPrice protects us: if the provider's price rose since the quote, it refuses instead of charging more.
    const r = await TextVerified.create(name, q.costMilli / 1000);
    const [u] = await db.update(smsVerifications)
      .set({ providerId: r.id, number: r.number, endsAt: r.endsAt ? new Date(r.endsAt) : null, updatedAt: new Date() })
      .where(eq(smsVerifications.id, v.id)).returning();
    return present(u);
  } catch (e) {
    await finish(db, v.id, "failed");
    if (isOutOfFunds((e as Error).message)) {
      await alertSupplierFunds(db, "TextVerified", { customerFacing: "A customer couldn't get a verification number (they were not charged). Verification codes stay unavailable until you top up.", adminPath: "/admin/verify" });
      throw new AppError(503, "PROVIDER_ERROR", "Verification numbers are temporarily unavailable. You have not been charged. Please try again in a little while.");
    }
    if (e instanceof AppError && e.code === "PROVIDER_ERROR") {
      throw new AppError(502, "PROVIDER_ERROR", "No number is available for that service right now. You have not been charged. Please try again shortly.");
    }
    throw e;
  }
}

/** Close a verification: capture on "completed", refund otherwise. Safe to call twice. */
async function finish(db: Db, id: string, status: "completed" | "refunded" | "failed", code?: { code: string; text: string }) {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(smsVerifications).where(eq(smsVerifications.id, id)).for("update");
    if (!v || v.status !== "pending") return v;
    if (v.holdId) {
      const capture = status === "completed" ? v.priceKobo : 0;
      const platform = capture ? await platformWalletId(tx) : null;
      await settleHold(tx, v.holdId, capture, platform ? [{ walletId: platform, amount: capture, kind: "revenue:sms_verify" }] : [], {
        refType: "sms_verify", refId: v.id, idempotencyKey: `smsv:${v.id}:settle`,
      });
    }
    const [u] = await tx.update(smsVerifications)
      .set({ status, code: code?.code ?? v.code, smsText: code?.text ?? v.smsText, updatedAt: new Date() })
      .where(eq(smsVerifications.id, id)).returning();
    return u;
  });
}

/** Ask the provider for news on a pending verification. */
export async function refreshVerification(db: Db, id: string) {
  const [v] = await db.select().from(smsVerifications).where(eq(smsVerifications.id, id));
  if (!v || v.status !== "pending" || !v.providerId) return v;
  const sms = (await TextVerified.sms(v.providerId)).data ?? [];
  const latest = [...sms].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const text = latest?.smsContent ?? "";
  const code = latest ? latest.parsedCode || extractCode(text) || text.slice(0, 40) : null;
  if (code) return finish(db, id, "completed", { code, text: text.slice(0, 500) });
  const p = await TextVerified.get(v.providerId);
  if (outcomeFor(p.state, false) === "refunded") return finish(db, id, "refunded");
  return v;
}

function present(v: typeof smsVerifications.$inferSelect) {
  return {
    id: v.id, service: v.serviceName, label: v.label || serviceLabel(v.serviceName), number: v.number, status: v.status,
    priceKobo: v.priceKobo, code: v.code, smsText: v.smsText, endsAt: v.endsAt, createdAt: v.createdAt,
  };
}

async function own(db: Db, userId: string, id: string) {
  const [v] = await db.select().from(smsVerifications).where(and(eq(smsVerifications.id, id), eq(smsVerifications.userId, userId)));
  if (!v) throw notFound("Verification");
  return v;
}

/** The customer's view of one verification; checks the provider while it's waiting. */
export async function myVerification(db: Db, userId: string, id: string) {
  const v = await own(db, userId, id);
  if (v.status !== "pending") return present(v);
  const r = await refreshVerification(db, id).catch((e) => { console.error("[verify] refresh", e); return v; });
  return present(r ?? v);
}

export async function cancelVerification(db: Db, userId: string, id: string) {
  const v = await own(db, userId, id);
  if (v.status !== "pending") return present(v);
  if (v.providerId) {
    // A code may have arrived just now: don't refund a delivered code.
    const r = await refreshVerification(db, id);
    if (r && r.status !== "pending") return present(r);
    try {
      await TextVerified.cancel(v.providerId);
    } catch (e) {
      throw new AppError(400, "CANT_CANCEL", "This number can't be cancelled yet. Please wait a minute and try again, or let it run out: you're refunded automatically if no code arrives.", { cause: String((e as Error).message) });
    }
  }
  return present((await finish(db, id, "refunded"))!);
}

export async function myVerifications(db: Db, userId: string) {
  const rows = await db.select().from(smsVerifications).where(eq(smsVerifications.userId, userId)).orderBy(desc(smsVerifications.createdAt)).limit(20);
  return rows.map(present);
}

/** Cron: settle waiting verifications even if the customer closed the page. */
export async function sweepVerifications(db: Db) {
  if (!textVerifiedConfigured()) return { checked: 0 };
  const pending = await db.select({ id: smsVerifications.id, providerId: smsVerifications.providerId, createdAt: smsVerifications.createdAt })
    .from(smsVerifications).where(eq(smsVerifications.status, "pending")).orderBy(asc(smsVerifications.createdAt)).limit(30);
  let checked = 0;
  for (const p of pending) {
    // A row with no provider id is a rental that never started (crash mid-request): refund after 5 minutes.
    if (!p.providerId) {
      if (Date.now() - p.createdAt.getTime() > 5 * 60_000) await finish(db, p.id, "failed");
      continue;
    }
    await refreshVerification(db, p.id).catch((e) => console.error("[verify] sweep", p.id, e));
    checked++;
  }
  const cfg = await getVerifyConfig(db);
  if (!cfg.syncedAt || Date.now() - Date.parse(cfg.syncedAt) > SYNC_EVERY_MS) await syncSmsServices(db).catch(() => null);
  return { checked };
}

/* ---------- Admin ---------- */

export async function verifyAdminOverview(db: Db) {
  const cfg = await getVerifyConfig(db);
  const configured = textVerifiedConfigured();
  const balance = configured ? await TextVerified.account().then((a) => ({ usd: a.currentBalance, error: null }), (e: Error) => ({ usd: null, error: e.message })) : { usd: null, error: null };
  const rate = await getUsdRateKobo(db);
  const [stats] = await db.select({
    completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    refunded: sql<number>`count(*) filter (where status in ('refunded','failed'))::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    revenueKobo: sql<number>`coalesce(sum(price_kobo) filter (where status = 'completed'), 0)::bigint`,
    costMilli: sql<number>`coalesce(sum(cost_usd_milli) filter (where status = 'completed'), 0)::bigint`,
  }).from(smsVerifications);
  const recent = await db.select({
    id: smsVerifications.id, service: smsVerifications.serviceName, status: smsVerifications.status, priceKobo: smsVerifications.priceKobo,
    costMilli: smsVerifications.costUsdMilli, createdAt: smsVerifications.createdAt, email: users.email,
  }).from(smsVerifications).innerJoin(users, eq(users.id, smsVerifications.userId)).orderBy(desc(smsVerifications.createdAt)).limit(25);
  const services = await db.select({ name: smsServices.name, providerLabel: smsServices.label, hidden: smsServices.hidden, costMilli: smsServices.costUsdMilli, fixedPriceKobo: smsServices.fixedPriceKobo })
    .from(smsServices).orderBy(asc(smsServices.name));
  return {
    config: cfg, configured, balance, usdRateKobo: rate,
    stats: { ...stats, revenueKobo: Number(stats.revenueKobo), costKobo: Math.round((Number(stats.costMilli) * rate) / 1000) },
    recent,
    services: services.map(({ providerLabel, ...s }) => ({
      ...s,
      label: providerLabel || serviceLabel(s.name),
      costKobo: s.costMilli && rate ? Math.round((s.costMilli * rate) / 1000) : null,
      markupPriceKobo: s.costMilli ? sellPriceKobo(s.costMilli, rate, cfg.markupBps) : null,
      priceKobo: s.fixedPriceKobo ?? (s.costMilli ? sellPriceKobo(s.costMilli, rate, cfg.markupBps) : null),
    })),
  };
}

export async function setSmsServiceHidden(db: Db, names: string[], hidden: boolean) {
  if (!names.length) return { updated: 0 };
  const r = await db.update(smsServices).set({ hidden }).where(inArray(smsServices.name, names)).returning({ name: smsServices.name });
  return { updated: r.length };
}

/** Fixed Naira price for one app (null = back to the markup). Also fetches its cost so the admin sees the margin. */
export async function setSmsFixedPrice(db: Db, name: string, kobo: number | null) {
  const [s] = await db.select({ name: smsServices.name }).from(smsServices).where(eq(smsServices.name, name));
  if (!s) throw notFound("App");
  if (kobo !== null && (!Number.isInteger(kobo) || kobo < 100 || kobo > 100_000_000)) throw badRequest("Enter a price between ₦1 and ₦1,000,000.");
  await db.update(smsServices).set({ fixedPriceKobo: kobo }).where(eq(smsServices.name, name));
  const q = await quoteSmsService(db, name).catch(() => null);
  const rate = await getUsdRateKobo(db);
  const costKobo = q && rate ? Math.round((q.costMilli * rate) / 1000) : null;
  return { name, fixedPriceKobo: kobo, costKobo, belowCost: kobo !== null && costKobo !== null && kobo < costKobo };
}
