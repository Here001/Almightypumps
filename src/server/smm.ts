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
import { getMinOrderKobo, getUsdRateKobo, reprice } from "./pricing";
import { keyHint, open, seal } from "./secretBox";
import { smmOrders, smmProviders, smmServices } from "./db/schema";
import { AppError, badRequest, notFound } from "./errors";
import { linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";

type Provider = typeof smmProviders.$inferSelect;

function providerKey(p: Provider): string {
  if (p.apiKeyEnc) {
    try {
      return open(p.apiKeyEnc).trim();
    } catch {
      throw new AppError(500, "PROVIDER_KEY_UNREADABLE", `The saved API key for "${p.name}" can't be read any more. Paste it again in Admin → Growth providers.`);
    }
  }
  // Trim: keys pasted from a phone often carry a trailing space or newline.
  const key = p.apiKeyEnv ? process.env[p.apiKeyEnv]?.trim() : "";
  if (!key) throw new AppError(500, "PROVIDER_KEY_MISSING", `No API key for "${p.name}". Add it in Admin → Growth providers.`);
  return key;
}

/** One request to a standard SMM panel (API v2). */
async function panelCall(apiUrl: string, key: string, params: Record<string, string>, name = "Provider"): Promise<unknown> {
  // Standard panels read "key"; some custom-built panels read "api_key". Sending both is harmless.
  const body = new URLSearchParams({ key, api_key: key, ...params });
  const res = await fetch(apiUrl, {
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
    throw new Error(`${name} returned a non-JSON response (HTTP ${res.status}). Check the API URL: it usually ends in /api/v2.`);
  }
}

async function call(p: Provider, params: Record<string, string>): Promise<unknown> {
  return panelCall(p.apiUrl, providerKey(p), params, `Provider "${p.name}"`);
}

/** For admin screens: show what the provider actually said instead of a generic error. */
async function adminProviderCall<T>(p: Provider, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = (e as Error).message || "Unknown error";
    // Diagnostics only: never log the key itself.
    const raw = p.apiKeyEnc ? "(stored)" : (p.apiKeyEnv ? process.env[p.apiKeyEnv] ?? "" : "");
    console.error(`[provider] ${p.name} ${p.apiUrl}: ${msg} (key length ${raw.trim().length}, had outer spaces: ${raw !== raw.trim()}, inner spaces: ${/\s/.test(raw.trim())})`);
    const hint = /api key|invalid key|unauthori[sz]ed/i.test(msg)
      ? ` Copy the API key again from ${p.name} and paste it in "Change API key" (no spaces).`
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
  const list = await adminProviderCall(p, async () => {
    const raw = await call(p, { action: "services" });
    // Diagnostics: which fields this panel sends (e.g. how it marks "recommended"). No secrets here.
    if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") {
      const flagged = raw.filter((r) => r && typeof r === "object" && Object.keys(r).some((k) => /recommend|featured|tag|badge|label/i.test(k)));
      console.info(`[provider] ${p.name} service fields: ${Object.keys(raw[0]).join(", ")}; rows with tag-like fields: ${flagged.length}`);
      if (flagged[0]) console.info(`[provider] ${p.name} sample tagged row: ${JSON.stringify(flagged[0]).slice(0, 400)}`);
    }
    return parseServices(raw);
  });

  // Non-Naira panels on "auto rate": refresh the exchange rate from the site's dollar rate before pricing.
  if (p.fxAuto && p.currency !== "NGN") {
    const rate = await getUsdRateKobo(db);
    if (rate > 0 && rate !== p.fxKoboPerUnit) {
      await db.update(smmProviders).set({ fxKoboPerUnit: rate }).where(eq(smmProviders.id, p.id));
      p.fxKoboPerUnit = rate;
    }
  }

  const rows = new Map<string, typeof smmServices.$inferInsert>();
  let skipped = 0;
  let restricted = 0;
  for (const s of list) {
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
    // Not-allowed services are stored (so admins can see them) but never put on sale.
    const blocked = isRestricted(s.name, s.category);
    if (blocked) restricted++;
    rows.set(s.service, {
      providerId: p.id, providerServiceId: s.service, name: s.name.slice(0, 300), category: s.category.slice(0, 120), type: s.type,
      providerRate: s.rate, rateKobo, minQty: s.min, maxQty: s.max, refill: s.refill, cancel: s.cancel, updatedAt: new Date(),
      platform: platformFor(s.category), kind: kindFor(s.name), displayName: displayName(s.name).slice(0, 300),
      active: !blocked, hiddenReason: blocked ? "policy" : null, providerRecommended: s.recommended, providerExtra: s.extra,
    });
  }

  // Keep an admin's "hidden" choice across syncs; policy always wins; everything else goes (back) on sale.
  const reason = sql`(CASE WHEN excluded.hidden_reason = 'policy' THEN 'policy'
                           WHEN ${smmServices.hiddenReason} = 'admin' THEN 'admin' ELSE NULL END)`;
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
          cancel: excluded("cancel"), updatedAt: excluded("updated_at"),
          platform: excluded("platform"), kind: excluded("kind"), displayName: excluded("display_name"),
          hiddenReason: reason, active: sql`${reason} IS NULL`, providerRecommended: excluded("provider_recommended"), providerExtra: excluded("provider_extra"),
        },
      });
  }

  // Apply platform/type markup rules on top of the provider default.
  if (values.length) await reprice(db, eq(smmServices.providerId, p.id));

  // Services the provider no longer lists (or now prices at 0): take them off sale.
  const keep = [...rows.keys()];
  const hidden = await db
    .update(smmServices)
    .set({ active: false, hiddenReason: "provider", updatedAt: new Date() })
    .where(and(eq(smmServices.providerId, p.id), sql`${smmServices.hiddenReason} IS DISTINCT FROM 'provider'`, keep.length ? notInArray(smmServices.providerServiceId, keep) : sql`true`))
    .returning({ id: smmServices.id });

  return { upserted: values.length - restricted, skipped, restricted, hidden: hidden.length };
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
    .select({ platform: smmServices.platform, kind: smmServices.kind, count: sql<number>`count(distinct ${smmServices.matchKey})::int` })
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
  const kindOrder = ["Followers", "Likes", "Views", "Comments", "Shares", "Saves", "Plays", "Live viewers", "Poll votes", "Traffic", "Other"];
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
  // One row per product: when several connected providers sell the same service (same match_key),
  // show the cheapest copy. A product counts as recommended if any copy is starred/recommended.
  const ranked = db
    .select({
      id: sql<number>`${smmServices.publicId}`.as("id"),
      name: sql<string>`coalesce(nullif(${smmServices.displayName}, ''), ${smmServices.name})`.as("name"),
      platform: sql<string>`${smmServices.platform}`.as("platform"),
      kind: sql<string>`${smmServices.kind}`.as("kind"),
      rateKobo: sql<number>`${smmServices.rateKobo}`.as("rate_kobo"),
      min: sql<number>`${smmServices.minQty}`.as("min"),
      max: sql<number>`${smmServices.maxQty}`.as("max"),
      refill: sql<boolean>`${smmServices.refill}`.as("refill"),
      cancel: sql<boolean>`${smmServices.cancel}`.as("cancel"),
      recommended: sql<boolean>`bool_or(${smmServices.featured} OR ${smmServices.providerRecommended}) over (partition by ${smmServices.matchKey})`.as("recommended"),
      sources: sql<number>`(count(*) over (partition by ${smmServices.matchKey}))::int`.as("sources"),
      rn: sql<number>`row_number() over (partition by ${smmServices.matchKey} order by ${smmServices.rateKobo}, ${smmServices.publicId})`.as("rn"),
    })
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(and(...filters))
    .as("ranked");
  const rows = await db
    .select({
      id: ranked.id, name: ranked.name, platform: ranked.platform, kind: ranked.kind, rateKobo: ranked.rateKobo,
      min: ranked.min, max: ranked.max, refill: ranked.refill, cancel: ranked.cancel, recommended: ranked.recommended,
    })
    .from(ranked)
    .where(sql`${ranked.rn} = 1`)
    // Recommended (by the provider or starred by an admin) first, then cheapest.
    .orderBy(sql`${ranked.recommended} DESC`, ranked.rateKobo, ranked.id)
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
  const [chosen] = await db.select().from(smmServices).where(eq(smmServices.publicId, input.servicePublicId));
  if (!chosen) throw notFound("Service");
  // Route to the cheapest connected provider selling this same product (the customer's pick if it's still
  // on sale and cheapest). Never charge more than the price the customer was shown.
  const [best] = await db
    .select({ svc: smmServices, p: smmProviders })
    .from(smmServices)
    .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
    .where(and(onSale(), eq(smmServices.matchKey, chosen.matchKey ?? ""), sql`${smmServices.rateKobo} <= ${chosen.rateKobo}`))
    .orderBy(smmServices.rateKobo, sql`(${smmServices.id} = ${chosen.id}) DESC`)
    .limit(1);
  if (!best) {
    const pricier = await db.select({ id: smmServices.id }).from(smmServices)
      .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
      .where(and(onSale(), eq(smmServices.matchKey, chosen.matchKey ?? ""))).limit(1);
    if (pricier?.length) throw badRequest("This service's price just changed. Close and reopen it to see the new price.");
    throw notFound("Service");
  }
  const svc = best.svc;
  const p = best.p;

  const link = input.link.trim();
  if (!validLink(link)) throw badRequest("Paste a valid link or username for this service.");
  const qtyErr = validateQuantity(input.quantity, svc.minQty, svc.maxQty);
  if (qtyErr) throw badRequest(qtyErr);
  const cost = orderCost(svc.rateKobo, input.quantity);
  const minOrder = await getMinOrderKobo(db);
  if (cost < minOrder) {
    const needQty = Math.min(svc.maxQty, Math.ceil((minOrder * 1000) / svc.rateKobo));
    throw badRequest(`The minimum order is ₦${(minOrder / 100).toLocaleString("en-NG")}. Order at least ${needQty.toLocaleString("en-NG")} for this service.`);
  }

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
    // Platform/type rules still win over this default; reprice() applies whichever is most specific.
    const repriced = markupBps !== p.markupBps ? await reprice(tx, eq(smmServices.providerId, p.id)) : 0;
    return { provider: updated, repriced };
  });
}

export type ServiceStatus = "on_sale" | "admin" | "policy" | "provider";

/** Admin view of every service, with why it's hidden. */
export type AdminServiceFilter = { status?: ServiceStatus; platform?: string; kind?: string; q?: string };

function adminFilters(input: AdminServiceFilter) {
  const filters = [];
  if (input.status === "on_sale") filters.push(sql`${smmServices.hiddenReason} IS NULL`);
  else if (input.status) filters.push(eq(smmServices.hiddenReason, input.status));
  if (input.platform) filters.push(eq(smmServices.platform, input.platform));
  if (input.kind) filters.push(eq(smmServices.kind, input.kind));
  const words = (input.q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  for (const w of words) {
    const like = `%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    filters.push(sql`(${smmServices.name} ILIKE ${like} OR ${smmServices.platform} ILIKE ${like} OR ${smmServices.providerServiceId} = ${w})`);
  }
  return filters;
}

export async function adminServices(db: Db, input: AdminServiceFilter & { offset?: number }) {
  const filters = adminFilters(input);
  const where = filters.length ? and(...filters) : undefined;
  const offset = Math.max(input.offset ?? 0, 0);
  const [rows, counts, platforms] = await Promise.all([
    db
      .select({
        id: smmServices.publicId, name: sql<string>`coalesce(nullif(${smmServices.displayName}, ''), ${smmServices.name})`,
        providerName: smmProviders.name, providerServiceId: smmServices.providerServiceId, platform: smmServices.platform, kind: smmServices.kind,
        rateKobo: smmServices.rateKobo, providerRate: smmServices.providerRate, fx: smmProviders.fxKoboPerUnit,
        min: smmServices.minQty, max: smmServices.maxQty, refill: smmServices.refill, hiddenReason: smmServices.hiddenReason,
        featured: smmServices.featured, providerRecommended: smmServices.providerRecommended,
      })
      .from(smmServices)
      .innerJoin(smmProviders, eq(smmProviders.id, smmServices.providerId))
      .where(where)
      .orderBy(smmServices.platform, sql`(${smmServices.featured} OR ${smmServices.providerRecommended}) DESC`, smmServices.rateKobo, smmServices.publicId)
      .limit(51)
      .offset(offset),
    db
      .select({ reason: smmServices.hiddenReason, n: sql<number>`count(*)::int` })
      .from(smmServices)
      .where(input.platform ? eq(smmServices.platform, input.platform) : undefined)
      .groupBy(smmServices.hiddenReason),
    db.selectDistinct({ platform: smmServices.platform }).from(smmServices).orderBy(smmServices.platform),
  ]);
  const kinds = input.platform
    ? await db.selectDistinct({ kind: smmServices.kind }).from(smmServices).where(eq(smmServices.platform, input.platform)).orderBy(smmServices.kind)
    : [];
  const count = (r: string | null) => counts.find((c) => c.reason === r)?.n ?? 0;
  return {
    services: rows.slice(0, 50).map((r) => ({
      ...r,
      // What we pay the provider per 1,000, in kobo (rounded up).
      costKobo: Math.ceil(Number(r.providerRate) * r.fx),
    })),
    hasMore: rows.length > 50,
    counts: { on_sale: count(null), admin: count("admin"), policy: count("policy"), provider: count("provider") },
    platforms: platforms.map((p) => p.platform),
    kinds: kinds.map((k) => k.kind),
    // How many services matching platform/kind/search each bulk button would change.
    bulk: await bulkCounts(db, input),
  };
}

/** Hide or unhide one service. Only "on sale" and "hidden by admin" can be switched. */
export async function setServiceHidden(db: Db, publicId: number, hidden: boolean) {
  const [svc] = await db.select({ id: smmServices.id, hiddenReason: smmServices.hiddenReason }).from(smmServices).where(eq(smmServices.publicId, publicId));
  if (!svc) throw notFound("Service");
  if (svc.hiddenReason === "policy") throw badRequest("This service isn't allowed on Almighty Pumps (fake reviews, contest votes or fake shop activity), so it can't be put on sale.");
  if (svc.hiddenReason === "provider") throw badRequest("The provider no longer offers this service. It comes back automatically if they list it again and you sync.");
  const [u] = await db
    .update(smmServices)
    .set({ hiddenReason: hidden ? "admin" : null, active: !hidden, updatedAt: new Date() })
    .where(eq(smmServices.id, svc.id))
    .returning({ id: smmServices.publicId, hiddenReason: smmServices.hiddenReason });
  return u;
}

async function bulkCounts(db: Db, input: AdminServiceFilter) {
  const filters = adminFilters({ ...input, status: undefined });
  const [r] = await db
    .select({
      canHide: sql<number>`count(*) filter (where ${smmServices.hiddenReason} is null)::int`,
      canShow: sql<number>`count(*) filter (where ${smmServices.hiddenReason} = 'admin')::int`,
    })
    .from(smmServices)
    .where(filters.length ? and(...filters) : undefined);
  return r ?? { canHide: 0, canShow: 0 };
}

/**
 * Switch every service matching a filter on or off at once. Only touches services
 * that are on sale or hidden by an admin; "not allowed" and "no longer offered" stay as they are.
 */
export async function setServicesHiddenBulk(db: Db, filter: Omit<AdminServiceFilter, "status">, hidden: boolean) {
  const filters = adminFilters(filter);
  filters.push(hidden ? sql`${smmServices.hiddenReason} IS NULL` : eq(smmServices.hiddenReason, "admin"));
  const changed = await db
    .update(smmServices)
    .set({ hiddenReason: hidden ? "admin" : null, active: !hidden, updatedAt: new Date() })
    .where(and(...filters))
    .returning({ id: smmServices.id });
  return { changed: changed.length };
}

/** Star (or un-star) a service so customers see it first. Kept across syncs. */
export async function setServiceFeatured(db: Db, publicId: number, featured: boolean) {
  const [u] = await db
    .update(smmServices)
    .set({ featured, updatedAt: new Date() })
    .where(eq(smmServices.publicId, publicId))
    .returning({ id: smmServices.publicId, featured: smmServices.featured });
  if (!u) throw notFound("Service");
  return u;
}


/* ---------- Adding and editing providers from the admin page ---------- */

const clean = (k: string) => k.replace(/\s+/g, "");

/** Try a panel's API (balance + service count) before saving it. */
export async function testPanel(apiUrl: string, key: string) {
  try {
    const bal = parseBalance(await panelCall(apiUrl, clean(key), { action: "balance" }));
    const services = parseServices(await panelCall(apiUrl, clean(key), { action: "services" }));
    return { ok: true as const, balance: bal.balance, currency: bal.currency, services: services.length };
  } catch (e) {
    const msg = (e as Error).message || "No response";
    throw new AppError(400, "PROVIDER_TEST_FAILED", `Couldn't connect: ${msg}`);
  }
}

export async function addProvider(db: Db, input: { name: string; apiUrl: string; apiKey: string; currency: string; fxKoboPerUnit?: number; markupBps: number }) {
  const t = await testPanel(input.apiUrl, input.apiKey);
  const currency = (t.currency || input.currency || "NGN").toUpperCase().slice(0, 3);
  const fxAuto = currency !== "NGN" && !input.fxKoboPerUnit;
  const fx = currency === "NGN" ? 100 : input.fxKoboPerUnit || (await getUsdRateKobo(db));
  if (!fx) throw badRequest("Set the exchange rate (₦ per 1 " + currency + ") first.");
  const [p] = await db.insert(smmProviders).values({
    name: input.name.trim(), apiUrl: input.apiUrl.trim(), apiKeyEnv: "", apiKeyEnc: seal(clean(input.apiKey)), apiKeyHint: keyHint(clean(input.apiKey)),
    currency, fxKoboPerUnit: fx, fxAuto, markupBps: input.markupBps,
  }).returning({ id: smmProviders.id, name: smmProviders.name });
  return { ...p, test: t };
}

export async function editProvider(db: Db, id: string, input: { name?: string; apiUrl?: string; apiKey?: string; fxKoboPerUnit?: number | null }) {
  const [p] = await db.select().from(smmProviders).where(eq(smmProviders.id, id));
  if (!p) throw notFound("Provider");
  const apiUrl = input.apiUrl?.trim() || p.apiUrl;
  const set: Partial<typeof smmProviders.$inferInsert> = {};
  if (input.name?.trim()) set.name = input.name.trim();
  if (input.apiUrl?.trim()) set.apiUrl = apiUrl;
  let test: Awaited<ReturnType<typeof testPanel>> | null = null;
  if (input.apiKey?.trim()) {
    test = await testPanel(apiUrl, input.apiKey);
    set.apiKeyEnc = seal(clean(input.apiKey));
    set.apiKeyHint = keyHint(clean(input.apiKey));
  } else if (input.apiUrl?.trim() && input.apiUrl.trim() !== p.apiUrl) {
    test = await testPanel(apiUrl, providerKey(p));
  }
  if (input.fxKoboPerUnit !== undefined && p.currency !== "NGN") {
    set.fxAuto = input.fxKoboPerUnit === null;
    set.fxKoboPerUnit = input.fxKoboPerUnit ?? ((await getUsdRateKobo(db)) || p.fxKoboPerUnit);
  }
  if (Object.keys(set).length) await db.update(smmProviders).set(set).where(eq(smmProviders.id, id));
  // reprice() reads the provider's exchange rate from the database, so new prices apply at once.
  const repriced = set.fxKoboPerUnit !== undefined && set.fxKoboPerUnit !== p.fxKoboPerUnit
    ? await reprice(db, eq(smmServices.providerId, id))
    : 0;
  return { ok: true, test, repriced };
}

/** Remove a provider for good. Only possible when none of its services were ever ordered (order history stays intact). */
export async function removeProvider(db: Db, id: string) {
  const [p] = await db.select({ id: smmProviders.id, name: smmProviders.name }).from(smmProviders).where(eq(smmProviders.id, id));
  if (!p) throw notFound("Provider");
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(smmOrders)
    .innerJoin(smmServices, eq(smmServices.id, smmOrders.serviceId)).where(eq(smmServices.providerId, id));
  if (used.n > 0) throw badRequest(`${p.name} has ${used.n} order${used.n === 1 ? "" : "s"} in your history, so it can't be deleted. Disconnect it instead: its services stop selling straight away.`);
  await db.transaction(async (tx) => {
    await tx.delete(smmServices).where(eq(smmServices.providerId, id));
    await tx.delete(smmProviders).where(eq(smmProviders.id, id));
  });
  return { removed: p.name };
}
