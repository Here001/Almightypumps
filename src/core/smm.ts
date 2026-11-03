/**
 * Social growth (SMM) provider logic: pricing, response parsing and order
 * settlement. Providers follow the common "panel API v2" shape:
 *   POST {apiUrl}  key=..., action=services|add|status|balance
 */
import { assertKobo, proportion, type Kobo } from "./money.ts";

export type OrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "CANCELLED" | "FAILED";

export function mapProviderStatus(raw: string | undefined | null): OrderStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "completed" || s === "complete") return "COMPLETED";
  if (s === "partial") return "PARTIAL";
  if (s === "canceled" || s === "cancelled" || s === "refunded") return "CANCELLED";
  if (s === "in progress" || s === "processing" || s === "inprogress") return "PROCESSING";
  return "PENDING";
}

export const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(["COMPLETED", "PARTIAL", "CANCELLED", "FAILED"]);

/**
 * Convert a provider rate (per 1000, in the provider's currency, as a decimal
 * string such as "0.4512") into our selling rate in kobo per 1000.
 * fxKoboPerUnit: how many kobo one unit of the provider currency costs us
 * (for an NGN provider use 100; for USD at ₦1,600 use 160000).
 */
export function sellRatePer1000(providerRate: string, fxKoboPerUnit: number, markupBps: number): Kobo {
  if (!/^\d+(\.\d+)?$/.test(providerRate.trim())) throw new Error(`Invalid provider rate: ${providerRate}`);
  assertKobo(fxKoboPerUnit, "fxKoboPerUnit");
  if (!Number.isInteger(markupBps) || markupBps < 0) throw new Error("markupBps must be a non-negative integer");
  // Work in micro-units to avoid float drift: rate * 1e6 as an integer.
  const [w, f = ""] = providerRate.trim().split(".");
  const micro = BigInt(w) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  const costKoboMicro = micro * BigInt(fxKoboPerUnit); // kobo * 1e6
  const withMarkup = costKoboMicro * BigInt(10_000 + markupBps); // kobo * 1e6 * 1e4
  const divisor = 1_000_000n * 10_000n;
  const kobo = (withMarkup + divisor - 1n) / divisor; // round up so we never sell at a loss
  return Number(kobo);
}

/** Price of an order: rate per 1000 * quantity / 1000, rounded up, minimum 1 kobo. */
export function orderCost(ratePer1000: Kobo, quantity: number): Kobo {
  assertKobo(ratePer1000, "rate");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number");
  return Math.max(1, Math.ceil((ratePer1000 * quantity) / 1000));
}

export function validateQuantity(q: number, min: number, max: number): string | null {
  if (!Number.isInteger(q)) return "Quantity must be a whole number.";
  if (q < min) return `The minimum for this service is ${min.toLocaleString("en-NG")}.`;
  if (q > max) return `The maximum for this service is ${max.toLocaleString("en-NG")}.`;
  return null;
}

/**
 * How much of an order's hold to capture once the provider reports a status.
 * Non-final statuses return null (keep holding).
 */
export function settleOrder(
  cost: Kobo,
  quantity: number,
  status: OrderStatus,
  remains: number | null,
): { capture: Kobo; release: Kobo } | null {
  if (!FINAL_STATUSES.has(status)) return null;
  if (status === "COMPLETED") return { capture: cost, release: 0 };
  if (status === "CANCELLED" || status === "FAILED") return { capture: 0, release: cost };
  // PARTIAL: charge only for what was delivered.
  const left = Math.min(quantity, Math.max(0, Math.floor(remains ?? 0)));
  const delivered = quantity - left;
  const capture = proportion(cost, delivered, quantity);
  return { capture, release: cost - capture };
}

/* ---------- Provider response parsing (defensive, providers vary) ---------- */

export type ProviderService = {
  service: string;
  name: string;
  category: string;
  type: string;
  rate: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  /** The provider flags this service as recommended/featured (field name varies by panel). */
  recommended: boolean;
  /** Any non-standard fields the provider sent (kept so we can see how it tags services). */
  extra: Record<string, unknown> | null;
};

const STANDARD_FIELDS = new Set(["service", "name", "category", "type", "rate", "min", "max", "refill", "cancel", "dripfeed"]);

export function extraFields(row: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STANDARD_FIELDS.has(k.toLowerCase())) continue;
    out[k] = typeof v === "string" ? v.slice(0, 300) : v;
  }
  return Object.keys(out).length ? out : null;
}

const TRUTHY = new Set(["1", "true", "yes", "y"]);

/**
 * Panels mark their picks in different ways: `recommended: true`, `is_recommended: 1`,
 * `featured: "yes"`, or a tag/badge/label field containing "recommended". Accept any of them.
 */
export function isProviderRecommended(row: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase();
    if (/recommend|featured|is_?top|best_?seller/.test(k)) {
      if (value === true || value === 1 || TRUTHY.has(String(value).trim().toLowerCase())) return true;
    }
    if (/tag|badge|label|flag|highlight|status/.test(k)) {
      const text = Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "";
      if (/recommend/i.test(text)) return true;
    }
  }
  return false;
}

function providerError(json: unknown): string | null {
  if (json && typeof json === "object" && "error" in json) {
    return String((json as { error: unknown }).error || "Provider error");
  }
  return null;
}

export function parseServices(json: unknown): ProviderService[] {
  const err = providerError(json);
  if (err) throw new Error(err);
  if (!Array.isArray(json)) throw new Error("Provider returned an unexpected services list");
  const out: ProviderService[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rate = String(r.rate ?? "").trim();
    const min = Number(r.min);
    const max = Number(r.max);
    if (!r.service || !/^\d+(\.\d+)?$/.test(rate) || !Number.isFinite(min) || !Number.isFinite(max)) continue;
    out.push({
      service: String(r.service),
      name: String(r.name ?? "Service"),
      category: String(r.category ?? "Other"),
      type: String(r.type ?? "Default"),
      rate,
      min: Math.max(1, Math.floor(min)),
      max: Math.max(1, Math.floor(max)),
      refill: r.refill === true || r.refill === 1 || r.refill === "1",
      cancel: r.cancel === true || r.cancel === 1 || r.cancel === "1",
      recommended: isProviderRecommended(r),
      extra: extraFields(r),
    });
  }
  return out;
}

export function parseAdd(json: unknown): string {
  const err = providerError(json);
  if (err) throw new Error(err);
  const order = json && typeof json === "object" ? (json as { order?: unknown }).order : undefined;
  if (order === undefined || order === null || order === "") throw new Error("Provider did not return an order id");
  return String(order);
}

export type ProviderStatus = { status: OrderStatus; startCount: number | null; remains: number | null; error?: string };

function oneStatus(r: unknown): ProviderStatus {
  const err = providerError(r);
  if (err) return { status: "PENDING", startCount: null, remains: null, error: err };
  const o = (r ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return { status: mapProviderStatus(o.status as string), startCount: num(o.start_count), remains: num(o.remains) };
}

/** Parse a multi-order status response: { "123": {...}, "124": {...} } */
export function parseMultiStatus(json: unknown): Map<string, ProviderStatus> {
  const err = providerError(json);
  if (err) throw new Error(err);
  const map = new Map<string, ProviderStatus>();
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const [id, v] of Object.entries(json as Record<string, unknown>)) map.set(id, oneStatus(v));
  }
  return map;
}

export function parseBalance(json: unknown): { balance: string; currency: string } {
  const err = providerError(json);
  if (err) throw new Error(err);
  const o = (json ?? {}) as Record<string, unknown>;
  return { balance: String(o.balance ?? "0"), currency: String(o.currency ?? "") };
}
