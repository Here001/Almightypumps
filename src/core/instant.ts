/**
 * Pricing and parsing rules for API-delivered products (no dependencies; tested):
 * Reloadly gift cards + Nigerian airtime/data, eSIM Access travel eSIMs.
 */

/** Provider cost (in its currency) → kobo. NGN is direct; USD uses the site dollar rate (kobo per $1). */
export function costToKobo(amount: number, currency: string, usdRateKobo: number): number | null {
  if (!(amount > 0)) return null;
  const c = currency.toUpperCase();
  if (c === "NGN") return Math.ceil(amount * 100);
  if (c === "USD" && usdRateKobo > 0) return Math.ceil(amount * usdRateKobo);
  return null;
}

/** Cost + markup, rounded UP to a step in kobo (₦10 = 1000, ₦1 = 100). */
export function withMarkup(costKobo: number, markupBps: number, stepKobo = 1000): number {
  if (!(costKobo > 0)) return 0;
  const raw = (costKobo * (10_000 + Math.max(0, markupBps))) / 10_000;
  return Math.ceil(Math.round(raw * 1000) / 1000 / stepKobo) * stepKobo;
}

/* ---------- Gift cards ---------- */

export type GiftData = {
  currency: string;          // card currency, e.g. USD
  senderCurrency: string;    // what Reloadly charges us in
  type: "FIXED" | "RANGE";
  fixed: { value: number; cost: number }[]; // card value → our cost (sender currency)
  min: number | null; max: number | null;   // RANGE, card currency
  minCost: number | null; maxCost: number | null; // RANGE, sender currency
  fee: number;               // flat sender fee per card
  feePct: number;            // % sender fee
  logo: string | null;
  redeem: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Reloadly product → the parts we use. Returns null when we can't price it safely. */
export function parseGiftProduct(p: Record<string, unknown>): { id: number; name: string; brand: string; country: string; data: GiftData } | null {
  const id = num(p.productId);
  const country = (p.country as { isoName?: string } | undefined)?.isoName ?? "";
  const brand = (p.brand as { brandName?: string } | undefined)?.brandName ?? "";
  const type = String(p.denominationType ?? "").toUpperCase() === "RANGE" ? "RANGE" : "FIXED";
  const currency = String(p.recipientCurrencyCode ?? "").toUpperCase();
  const senderCurrency = String(p.senderCurrencyCode ?? "").toUpperCase();
  if (!Number.isInteger(id) || !country || !currency || !senderCurrency) return null;
  const fixed: GiftData["fixed"] = [];
  if (type === "FIXED") {
    const map = (p.fixedRecipientToSenderDenominationsMap ?? null) as Record<string, unknown> | null;
    const rec = Array.isArray(p.fixedRecipientDenominations) ? p.fixedRecipientDenominations.map(num) : [];
    const snd = Array.isArray(p.fixedSenderDenominations) ? p.fixedSenderDenominations.map(num) : [];
    rec.forEach((value, i) => {
      let cost = NaN;
      if (map) {
        const hit = Object.entries(map).find(([k]) => Math.abs(Number(k) - value) < 1e-9);
        if (hit) cost = num(hit[1]);
      }
      if (!(cost > 0) && rec.length === snd.length) cost = snd[i];
      if (value > 0 && cost > 0) fixed.push({ value, cost });
    });
    if (!fixed.length) return null;
    fixed.sort((a, b) => a.value - b.value);
  }
  const min = num(p.minRecipientDenomination), max = num(p.maxRecipientDenomination);
  const minCost = num(p.minSenderDenomination), maxCost = num(p.maxSenderDenomination);
  if (type === "RANGE" && !(min > 0 && max >= min && minCost > 0 && maxCost > 0)) return null;
  const redeem = (p.redeemInstruction as { concise?: string; verbose?: string } | null | undefined);
  const logos = Array.isArray(p.logoUrls) ? p.logoUrls.filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)) : [];
  return {
    id, country, brand: brand || String(p.productName ?? ""), name: String(p.productName ?? brand),
    data: {
      currency, senderCurrency, type, fixed,
      min: type === "RANGE" ? min : null, max: type === "RANGE" ? max : null,
      minCost: type === "RANGE" ? minCost : null, maxCost: type === "RANGE" ? maxCost : null,
      fee: num(p.senderFee) > 0 ? num(p.senderFee) : 0,
      feePct: num(p.senderFeePercentage) > 0 ? num(p.senderFeePercentage) : 0,
      logo: logos[0] ?? null,
      redeem: (redeem?.verbose || redeem?.concise || "").slice(0, 2000) || null,
    },
  };
}

/** Our cost (sender currency) for one card of `value`. Null if that value isn't sold. */
export function giftCost(d: GiftData, value: number): number | null {
  let base: number;
  if (d.type === "FIXED") {
    const hit = d.fixed.find((f) => Math.abs(f.value - value) < 1e-9);
    if (!hit) return null;
    base = hit.cost;
  } else {
    if (d.min === null || d.max === null || d.minCost === null || d.maxCost === null) return null;
    if (!(value >= d.min && value <= d.max)) return null;
    // Linear between the provider's min and max (both ends are its own prices); +1% for FX drift.
    const rate = d.max === d.min ? d.minCost / d.min : Math.max(d.minCost / d.min, d.maxCost / d.max);
    base = value * rate * 1.01;
  }
  const cost = base + d.fee + (base * d.feePct) / 100;
  return Math.ceil(cost * 100) / 100;
}

/* ---------- Nigerian airtime / data ---------- */

export const NG_NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"] as const;
export type NgNetwork = (typeof NG_NETWORKS)[number];

/** Reloadly operator name → our network ("MTN Nigeria Data" → MTN). */
export function networkOf(operatorName: string): NgNetwork | null {
  const n = operatorName.toLowerCase();
  if (/\bmtn\b/.test(n)) return "MTN";
  if (/airtel/.test(n)) return "Airtel";
  if (/\bglo\b|globacom/.test(n)) return "Glo";
  if (/9\s?mobile|etisalat/.test(n)) return "9mobile";
  return null;
}

/** "0803 123 4567" / "+2348031234567" / "8031234567" → "08031234567", or null. */
export function ngPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("234")) d = "0" + d.slice(3);
  if (/^[789]\d{9}$/.test(d)) d = "0" + d;
  return /^0[789][01]\d{8}$/.test(d) ? d : null;
}

const PREFIXES: Record<NgNetwork, string[]> = {
  MTN: ["0703", "0706", "0803", "0806", "0810", "0813", "0814", "0816", "0903", "0906", "0913", "0916", "0704", "07025", "07026"],
  Airtel: ["0701", "0708", "0802", "0808", "0812", "0901", "0902", "0904", "0907", "0912", "0911"],
  Glo: ["0705", "0805", "0807", "0811", "0815", "0905", "0915"],
  "9mobile": ["0809", "0817", "0818", "0908", "0909"],
};

/** Best guess from the number's prefix (numbers can be ported, so the customer can change it). */
export function guessNetwork(phone: string): NgNetwork | null {
  const p = ngPhone(phone);
  if (!p) return null;
  for (const net of NG_NETWORKS) if (PREFIXES[net].some((x) => p.startsWith(x))) return net;
  return null;
}

/* ---------- Travel eSIMs ---------- */

/** 1073741824 → "1GB", 524288000 → "500MB". */
export function dataSize(bytes: number): string {
  if (!(bytes > 0)) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(1))}GB`;
  return `${Math.round(bytes / 1024 ** 2)}MB`;
}

export function durationLabel(n: number, unit: string): string {
  const u = unit.toUpperCase().startsWith("MONTH") ? "month" : "day";
  return `${n} ${u}${n === 1 ? "" : "s"}`;
}

/** eSIM Access price (US$ × 10,000) → kobo. */
export function e4ToKobo(e4: number, usdRateKobo: number): number {
  return Math.ceil((e4 * usdRateKobo) / 10_000);
}
