/**
 * "Send a Package": real parcel delivery through Terminal Africa (T-Ship API), within Nigeria and USA → Nigeria.
 *
 * Flow: quote (create both addresses + the parcel at Terminal, fetch every carrier's rate, add our markup, store the
 * offers on a `shipments` row) → book (hold the customer's money, arrange the pickup with the chosen rate, capture to
 * `revenue:shipping`, or release the hold if the carrier refuses) → tracking (sync-orders cron + on view) → optional
 * cancel before pickup (Terminal refunds us; we credit the customer).
 *
 * Field names follow Terminal Africa's public OpenAPI spec and open-source client code (docs site blocked from the
 * sandbox). Every call logs `[terminal]` with the path + status so the first live calls can be checked in Vercel logs.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { NG_STATES, intlPhone, shipmentCode, shippingPrice } from "@/core/shipping";
import type { Db } from "./db";
import { shipments, users, type ShipEvent, type ShipRate } from "./db/schema";
import { env } from "./env";
import { AppError, badRequest, notFound } from "./errors";
import { readSetting, writeSetting } from "./appSettings";
import { creditWallet, linkHold, placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";
import { alertSupplierFunds, isOutOfFunds } from "./supplierFunds";

/* ---------------- settings ---------------- */

export type ShippingConfig = { enabled: boolean; markupBps: number };
const DEFAULTS: ShippingConfig = { enabled: true, markupBps: 1500 };
export const getShippingConfig = (db: Db) => readSetting(db, "shipping", DEFAULTS);
export const shippingConfigSchema = z.object({ enabled: z.boolean(), markupBps: z.number().int().min(0).max(100_000) });
export const saveShippingConfig = (db: Db, c: ShippingConfig) => writeSetting(db, "shipping", shippingConfigSchema.parse(c));

/* ---------------- Terminal Africa client ---------------- */

const keySet = () => !!env().TERMINAL_AFRICA_SECRET_KEY;
function baseUrl() {
  const e = env();
  if (e.TERMINAL_AFRICA_BASE_URL) return e.TERMINAL_AFRICA_BASE_URL.replace(/\/+$/, "");
  return /^sk_live/i.test(e.TERMINAL_AFRICA_SECRET_KEY.trim()) ? "https://api.terminal.africa/v1" : "https://sandbox.terminal.africa/v1";
}

class TerminalError extends Error {}

async function terminal<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!keySet()) throw new AppError(503, "SHIPPING_OFF", "Sending packages isn't available right now.");
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${env().TERMINAL_AFRICA_SECRET_KEY.trim()}`, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  console.log(`[terminal] ${init?.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}${res.ok ? "" : ` ${String(json.message ?? "").slice(0, 200)}`}`);
  if (!res.ok || json.status === false || json.data === undefined) throw new TerminalError(json.message || `Carrier service error (${res.status})`);
  return json.data;
}

/* ---------------- countries & states (from Terminal, cached) ---------------- */

export type Country = { code: string; name: string; dial: string | null };
const FALLBACK_COUNTRIES: Country[] = [
  { code: "NG", name: "Nigeria", dial: "234" }, { code: "US", name: "United States", dial: "1" }, { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "CA", name: "Canada", dial: "1" }, { code: "GH", name: "Ghana", dial: "233" },
];
type TCountry = { name?: string; isoCode?: string; iso_code?: string; code?: string; phonecode?: string; phone_code?: string };
type TState = { name?: string; isoCode?: string; iso_code?: string; code?: string };

/** Every country Terminal Africa can ship to/from, refreshed once a day. */
export async function shippingCountries(db: Db): Promise<Country[]> {
  const cached = await readSetting<{ at: number; list: Country[] }>(db, "shipping_countries", { at: 0, list: [] });
  if (cached.list.length && Date.now() - cached.at < 24 * 3600_000) return cached.list;
  try {
    const raw = await terminal<TCountry[]>("/countries");
    const list = (Array.isArray(raw) ? raw : [])
      .map((c) => ({ code: String(c.isoCode ?? c.iso_code ?? c.code ?? "").toUpperCase(), name: String(c.name ?? "").trim(), dial: (c.phonecode ?? c.phone_code ?? null) ? String(c.phonecode ?? c.phone_code).replace(/[^\d]/g, "") || null : null }))
      .filter((c) => /^[A-Z]{2}$/.test(c.code) && c.name)
      .sort((a, b) => (a.code === "NG" ? -1 : b.code === "NG" ? 1 : a.name.localeCompare(b.name)));
    if (list.length) { await writeSetting(db, "shipping_countries", { at: Date.now(), list }); return list; }
  } catch (e) { console.error("[shipping] countries", (e as Error).message); }
  return cached.list.length ? cached.list : FALLBACK_COUNTRIES;
}

const stateCache = new Map<string, { at: number; list: string[] }>();
/** States/regions of one country (Nigeria uses our own list). Empty list = type it in. */
export async function shippingStates(country: string): Promise<string[]> {
  const cc = country.toUpperCase();
  if (cc === "NG") return [...NG_STATES];
  if (!/^[A-Z]{2}$/.test(cc) || !keySet()) return [];
  const hit = stateCache.get(cc);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.list;
  try {
    const raw = await terminal<TState[]>(`/states?country_code=${cc}`);
    const list = (Array.isArray(raw) ? raw : []).map((st) => String(st.name ?? "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    stateCache.set(cc, { at: Date.now(), list });
    return list;
  } catch { return []; }
}

/* ---------------- quotes ---------------- */

const addressSchema = z.object({
  name: z.string().trim().min(3, "Enter the full name").max(80),
  phone: z.string().trim().min(7, "Enter a phone number").max(20),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  line1: z.string().trim().min(5, "Enter the street address").max(120),
  line2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter the city").max(60),
  state: z.string().trim().min(2, "Enter the state").max(60),
  zip: z.string().trim().max(12).optional().or(z.literal("")),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country"),
});
export const quoteSchema = z.object({
  from: addressSchema,
  to: addressSchema,
  description: z.string().trim().min(3, "Say what's in the package").max(120),
  weight: z.coerce.number().positive("Enter the weight"),
  weightUnit: z.enum(["g", "kg"]).default("kg"),
  value: z.coerce.number().positive("Enter the value").max(50_000_000),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
}).transform((v) => ({ ...v, weightKg: v.weightUnit === "g" ? v.weight / 1000 : v.weight }))
  .superRefine((v, ctx) => {
    if (v.weightKg < 0.01) ctx.addIssue({ code: "custom", path: ["weight"], message: "The lightest package we can send is 10 g." });
    if (v.weightKg > 70) ctx.addIssue({ code: "custom", path: ["weight"], message: "Max 70 kg per package." });
    for (const side of ["from", "to"] as const) {
      const a = v[side];
      if (a.country === "NG" && !(NG_STATES as readonly string[]).includes(a.state)) ctx.addIssue({ code: "custom", path: [side, "state"], message: "Choose a Nigerian state" });
      if (a.country === "US" && !/^\d{5}(-\d{4})?$/.test(a.zip ?? "")) ctx.addIssue({ code: "custom", path: [side, "zip"], message: "Enter the 5-digit US ZIP code" });
      if (a.country !== "NG" && !(a.zip ?? "").trim() && ["US", "GB", "CA"].includes(a.country)) ctx.addIssue({ code: "custom", path: [side, "zip"], message: "Enter the postcode" });
    }
  });
export type QuoteInput = z.infer<typeof quoteSchema>;

type TAddress = { address_id?: string; id?: string };
type TParcel = { parcel_id?: string; id?: string };
type TPackaging = { packaging_id?: string; id?: string };
type TRate = { rate_id?: string; id?: string; amount: number; currency?: string; carrier_name?: string; carrier_logo?: string; carrier_rate_description?: string; delivery_time?: string; pickup_time?: string };

async function createAddress(a: z.infer<typeof addressSchema>, dial: string | null) {
  const [first, ...rest] = a.name.split(/\s+/);
  const r = await terminal<TAddress>("/addresses", {
    method: "POST",
    body: {
      first_name: first, last_name: rest.join(" ") || first, email: a.email, phone: intlPhone(a.phone, a.country, dial),
      line1: a.line1, line2: a.line2 || undefined, city: a.city, state: a.state, zip: a.zip || undefined, country: a.country, is_residential: true,
    },
  });
  const id = r.address_id ?? r.id;
  if (!id) throw new TerminalError("No address id returned");
  return id;
}

let packagingId: string | null = null;
async function defaultPackaging() {
  if (packagingId) return packagingId;
  const p = await terminal<TPackaging>("/packaging/default/terminal");
  packagingId = p.packaging_id ?? p.id ?? null;
  if (!packagingId) throw new TerminalError("No default packaging");
  return packagingId;
}

const newCode = () => shipmentCode(randomBytes(8));

/** Ask every carrier for a price. Saves a 'quoted' shipment and returns its offers (with our markup). */
export async function quoteShipment(db: Db, userId: string, input: QuoteInput) {
  const cfg = await getShippingConfig(db);
  if (!cfg.enabled || !keySet()) throw badRequest("Sending packages isn't available right now. Please try again later.");
  const international = input.from.country !== input.to.country;
  const known = new Set((await shippingCountries(db)).map((c) => c.code));
  for (const c of [input.from.country, input.to.country]) if (known.size && !known.has(c)) throw badRequest("We can't send to or from that country.");
  try {
    const list = await shippingCountries(db);
    const dialOf = (cc: string) => list.find((c) => c.code === cc)?.dial ?? null;
    const [fromId, toId, pkg] = await Promise.all([createAddress(input.from, dialOf(input.from.country)), createAddress(input.to, dialOf(input.to.country)), defaultPackaging()]);
    const currency = !international && input.from.country === "NG" ? "NGN" : "USD";
    const parcel = await terminal<TParcel>("/parcels", {
      method: "POST",
      body: {
        description: input.description, packaging: pkg, weight_unit: "kg",
        items: [{ name: input.description, description: input.description, currency, value: input.value / input.quantity, quantity: input.quantity, weight: input.weightKg / input.quantity }],
      },
    });
    const parcelId = parcel.parcel_id ?? parcel.id;
    if (!parcelId) throw new TerminalError("No parcel id returned");
    const raw = await terminal<TRate[]>(`/rates/shipment?pickup_address=${encodeURIComponent(fromId)}&delivery_address=${encodeURIComponent(toId)}&parcel_id=${encodeURIComponent(parcelId)}&currency=NGN`);
    const rates: ShipRate[] = (Array.isArray(raw) ? raw : [])
      .filter((r) => (r.rate_id ?? r.id) && Number(r.amount) > 0 && (r.currency ?? "NGN").toUpperCase() === "NGN")
      .map((r) => {
        const costKobo = Math.round(Number(r.amount) * 100);
        return {
          rateId: String(r.rate_id ?? r.id), carrier: r.carrier_name ?? "Courier", logo: r.carrier_logo ?? null, service: r.carrier_rate_description ?? null,
          costKobo, priceKobo: shippingPrice(costKobo, cfg.markupBps), deliveryTime: r.delivery_time ?? null, pickupTime: r.pickup_time ?? null,
        };
      })
      .sort((a, b) => a.priceKobo - b.priceKobo)
      .slice(0, 12);
    const all = await shippingCountries(db);
    const nameOf = (code: string) => all.find((c) => c.code === code)?.name ?? code;
    if (!rates.length) throw badRequest("No courier can take this package on this route right now. Check the addresses and weight, or try again later.");
    const [row] = await db.insert(shipments).values({
      code: newCode(), userId,
      fromAddress: { ...input.from, countryName: nameOf(input.from.country) } as Record<string, string>,
      toAddress: { ...input.to, countryName: nameOf(input.to.country) } as Record<string, string>,
      parcel: { description: input.description, weightKg: input.weightKg, weightUnit: input.weightUnit, value: input.value, valueCurrency: currency, quantity: input.quantity },
      providerFromId: fromId, providerToId: toId, providerParcelId: parcelId, rates,
    }).returning({ id: shipments.id });
    return { quoteId: row.id, international, rates: rates.map(({ costKobo: _c, ...r }) => (void _c, r)) };
  } catch (e) {
    if (e instanceof TerminalError) {
      console.error("[shipping] quote", e.message);
      throw badRequest(/address|city|state|zip|postal/i.test(e.message) ? `The courier couldn't use one of the addresses: ${e.message}` : "We couldn't get prices right now. Please check the details and try again.");
    }
    throw e;
  }
}

/* ---------------- booking ---------------- */

type TPickup = {
  shipment_id?: string; id?: string; status?: string; carrier_tracking_number?: string; tracking_url?: string;
  extras?: { tracking_number?: string; tracking_url?: string; carrier_tracking_url?: string; shipping_label?: string; shipping_label_url?: string; label_url?: string; commercial_invoice_url?: string };
};

/** Pay for one of the quoted offers and arrange the pickup. */
export async function bookShipment(db: Db, userId: string, quoteId: string, rateId: string) {
  const cfg = await getShippingConfig(db);
  if (!cfg.enabled || !keySet()) throw badRequest("Sending packages isn't available right now.");
  // 1) Hold the money (and mark the quote as being booked so it can't be paid twice).
  const held = await db.transaction(async (tx) => {
    const [s] = await tx.select().from(shipments).where(and(eq(shipments.id, quoteId), eq(shipments.userId, userId))).for("update");
    if (!s) throw notFound("Quote");
    if (s.status !== "quoted") throw badRequest("This quote was already used. Get new prices to send another package.");
    if (Date.now() - s.createdAt.getTime() > 60 * 60_000) throw badRequest("These prices have expired. Please get new prices.");
    const rate = s.rates.find((r) => r.rateId === rateId);
    if (!rate) throw badRequest("Choose one of the couriers shown.");
    const holdId = await placeHold(tx, await walletIdForUser(tx, userId), rate.priceKobo, "shipping", { memo: `Package delivery ${s.code} (${rate.carrier})` });
    await linkHold(tx, holdId, s.id);
    await tx.update(shipments).set({ status: "booking", rateId, carrier: rate.carrier, carrierLogo: rate.logo, deliveryTime: rate.deliveryTime, priceKobo: rate.priceKobo, costKobo: rate.costKobo, holdId, updatedAt: new Date() }).where(eq(shipments.id, s.id));
    return { s, rate, holdId };
  });

  // 2) Arrange the pickup with the carrier.
  let pickup: TPickup;
  try {
    pickup = await terminal<TPickup>("/shipments/pickup", { method: "POST", body: { rate_id: rateId, purchase_insurance: false } });
  } catch (e) {
    const msg = (e as Error).message;
    await db.transaction(async (tx) => {
      await settleHold(tx, held.holdId, 0, [], { refType: "shipment", refId: held.s.id, idempotencyKey: `shipment:${held.s.id}:settle` });
      await tx.update(shipments).set({ status: "failed", error: msg.slice(0, 300), updatedAt: new Date() }).where(eq(shipments.id, held.s.id));
    });
    if (isOutOfFunds(msg)) {
      await alertSupplierFunds(db, "Terminal Africa (shipping)", { amountKobo: held.rate.costKobo, adminPath: "/admin/shipping" }).catch(() => {});
      throw badRequest("Package booking is temporarily unavailable. Your money is back in your wallet. Please try again in a little while.");
    }
    console.error("[shipping] pickup failed", msg);
    throw badRequest("The courier couldn't accept this booking. Your money is back in your wallet. Please get new prices and try again.");
  }

  // 3) Capture the payment and save the tracking details.
  const x = pickup.extras ?? {};
  await db.transaction(async (tx) => {
    await settleHold(tx, held.holdId, held.rate.priceKobo, [{ walletId: await platformWalletId(tx), amount: held.rate.priceKobo, kind: "revenue:shipping" }],
      { refType: "shipment", refId: held.s.id, idempotencyKey: `shipment:${held.s.id}:settle` });
    await tx.update(shipments).set({
      status: "booked", providerShipmentId: pickup.shipment_id ?? pickup.id ?? null,
      carrierTracking: x.tracking_number ?? pickup.carrier_tracking_number ?? null,
      trackingUrl: x.carrier_tracking_url ?? x.tracking_url ?? pickup.tracking_url ?? null,
      labelUrl: x.shipping_label_url ?? x.shipping_label ?? x.label_url ?? null,
      events: [{ at: new Date().toISOString(), text: `Booked with ${held.rate.carrier}. Waiting for pickup.`, location: `${held.s.fromAddress.city}, ${held.s.fromAddress.state}` }],
      updatedAt: new Date(),
    }).where(eq(shipments.id, held.s.id));
  });
  return { code: held.s.code };
}

/* ---------------- tracking ---------------- */

type TTrack = { status?: string; carrier_tracking_number?: string; events?: { description?: string; date?: string; created_at?: string; location?: string }[] };
const STATUS_MAP: Record<string, "booked" | "in_transit" | "delivered" | "cancelled"> = {
  draft: "booked", pending: "booked", confirmed: "booked", "in-transit": "in_transit", in_transit: "in_transit", delivered: "delivered", cancelled: "cancelled",
};

/** Ask the carrier for the latest status of one shipment. */
async function refresh(db: Db, s: typeof shipments.$inferSelect) {
  if (!s.providerShipmentId) return s;
  const t = await terminal<TTrack>(`/shipments/track/${encodeURIComponent(s.providerShipmentId)}`);
  const events: ShipEvent[] = (t.events ?? [])
    .map((e) => ({ at: String(e.date ?? e.created_at ?? ""), text: String(e.description ?? "").slice(0, 200), location: e.location ? String(e.location).slice(0, 80) : null }))
    .filter((e) => e.text)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const status = STATUS_MAP[String(t.status ?? "").toLowerCase()] ?? s.status;
  const [row] = await db.update(shipments).set({
    status: s.status === "cancelled" ? "cancelled" : status,
    events: events.length ? events : s.events,
    carrierTracking: t.carrier_tracking_number || s.carrierTracking,
    lastTrackedAt: new Date(), updatedAt: new Date(),
    deliveredAt: status === "delivered" && !s.deliveredAt ? new Date() : s.deliveredAt,
  }).where(eq(shipments.id, s.id)).returning();
  return row;
}

const ACTIVE = ["booked", "in_transit"] as const;

/** Cron: refresh active shipments that haven't been checked for 30 minutes. */
export async function sweepShipments(db: Db) {
  if (!keySet()) return { checked: 0 };
  const due = await db.select().from(shipments)
    .where(and(inArray(shipments.status, [...ACTIVE]), or(sql`${shipments.lastTrackedAt} IS NULL`, lt(shipments.lastTrackedAt, new Date(Date.now() - 30 * 60_000)))))
    .orderBy(shipments.lastTrackedAt).limit(25);
  for (const s of due) await refresh(db, s).catch((e) => console.error("[shipping] track", s.code, (e as Error).message));
  // Quotes nobody booked are just noise after a day.
  await db.delete(shipments).where(and(eq(shipments.status, "quoted"), lt(shipments.createdAt, new Date(Date.now() - 24 * 3600_000))));
  return { checked: due.length };
}

const place = (a: Record<string, string>) => `${a.city}, ${a.state}${a.country && a.country !== "NG" ? `, ${a.countryName || a.country}` : ""}`;

/** What anyone with the tracking number can see: no names, phones or street addresses. */
function publicView(s: typeof shipments.$inferSelect) {
  return {
    code: s.code, status: s.status, carrier: s.carrier, carrierLogo: s.carrierLogo, carrierTracking: s.carrierTracking, trackingUrl: s.trackingUrl,
    from: place(s.fromAddress),
    to: place(s.toAddress),
    deliveryTime: s.deliveryTime, events: s.events, bookedAt: s.createdAt, deliveredAt: s.deliveredAt,
  };
}

/** Public tracking page: by our code (AP…) or the carrier's tracking number. */
export async function trackPublic(db: Db, raw: string) {
  const q = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (q.length < 6 || q.length > 40) throw badRequest("Enter the tracking number you were given.");
  const [s] = await db.select().from(shipments)
    .where(and(or(eq(shipments.code, q), sql`upper(${shipments.carrierTracking}) = ${q}`), inArray(shipments.status, ["booked", "in_transit", "delivered", "cancelled"])))
    .limit(1);
  if (!s) throw notFound("Shipment with that tracking number");
  const fresh = ACTIVE.includes(s.status as (typeof ACTIVE)[number]) && (!s.lastTrackedAt || Date.now() - s.lastTrackedAt.getTime() > 10 * 60_000)
    ? await refresh(db, s).catch(() => s) : s;
  return publicView(fresh);
}

/* ---------------- customer & admin ---------------- */

export async function myShipments(db: Db, userId: string) {
  const rows = await db.select().from(shipments)
    .where(and(eq(shipments.userId, userId), sql`${shipments.status} NOT IN ('quoted', 'failed')`)).orderBy(desc(shipments.createdAt)).limit(50);
  return rows.map((s) => ({ ...publicView(s), id: s.id, priceKobo: s.priceKobo, labelUrl: s.labelUrl, toName: s.toAddress.name, canCancel: s.status === "booked" }));
}

export async function shippingInfo(db: Db) {
  const cfg = await getShippingConfig(db);
  return { enabled: cfg.enabled && keySet(), states: NG_STATES, countries: keySet() ? await shippingCountries(db).catch(() => FALLBACK_COUNTRIES) : FALLBACK_COUNTRIES };
}

/** Cancel before pickup: ask the carrier, then refund the customer in full. */
export async function cancelShipment(db: Db, shipmentId: string, by: { userId?: string; admin?: boolean }) {
  const [s] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
  if (!s || (!by.admin && s.userId !== by.userId)) throw notFound("Shipment");
  if (s.status === "cancelled") throw badRequest("This package was already cancelled and refunded.");
  if (s.status !== "booked") throw badRequest("This package has already been picked up, so it can't be cancelled here. Contact support.");
  if (s.providerShipmentId) {
    try { await terminal("/shipments/cancel", { method: "POST", body: { shipment_id: s.providerShipmentId } }); }
    catch (e) { throw badRequest(`The courier wouldn't cancel it: ${(e as Error).message}. Contact support.`); }
  }
  await db.transaction(async (tx) => {
    const [locked] = await tx.select({ status: shipments.status }).from(shipments).where(eq(shipments.id, s.id)).for("update");
    if (locked.status !== "booked") return;
    if (s.priceKobo) await creditWallet(tx, await walletIdForUser(tx, s.userId), s.priceKobo, "refund:shipping", { refType: "shipment", refId: s.id, memo: `Refund: package ${s.code} cancelled`, idempotencyKey: `shipment:${s.id}:refund` });
    await tx.update(shipments).set({ status: "cancelled", updatedAt: new Date(), events: [{ at: new Date().toISOString(), text: "Cancelled and refunded", location: null }, ...s.events] }).where(eq(shipments.id, s.id));
  });
  return { ok: true };
}

export async function shippingOverview(db: Db) {
  const config = await getShippingConfig(db);
  const rows = await db.select({ s: shipments, name: users.name, email: users.email }).from(shipments).innerJoin(users, eq(users.id, shipments.userId))
    .where(sql`${shipments.status} <> 'quoted'`).orderBy(desc(shipments.createdAt)).limit(60);
  const [t] = await db.select({
    booked: sql<number>`count(*) filter (where ${shipments.status} in ('booked','in_transit','delivered'))::int`,
    profit: sql<number>`coalesce(sum(${shipments.priceKobo} - ${shipments.costKobo}) filter (where ${shipments.status} in ('booked','in_transit','delivered')), 0)::bigint`,
  }).from(shipments);
  return {
    config, keySet: keySet(), sandbox: !/^sk_live/i.test(env().TERMINAL_AFRICA_SECRET_KEY.trim()) && !env().TERMINAL_AFRICA_BASE_URL,
    totals: { booked: t.booked, profitKobo: Number(t.profit) },
    shipments: rows.map(({ s, name, email }) => ({
      id: s.id, code: s.code, status: s.status, carrier: s.carrier, priceKobo: s.priceKobo, costKobo: s.costKobo, error: s.error, createdAt: s.createdAt,
      route: `${s.fromAddress.city} → ${s.toAddress.city}`, customer: { name, email }, carrierTracking: s.carrierTracking, labelUrl: s.labelUrl,
    })),
  };
}
