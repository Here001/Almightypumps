/**
 * "Get Verification Code" pricing and status rules (no dependencies; tested).
 * The provider (TextVerified) charges in US dollars; customers pay Naira.
 */

/** US dollars (float from the provider) → thousandths of a dollar, rounded up so we never undercharge. */
export function usdToMilli(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("Bad provider price");
  return Math.ceil(Math.round(usd * 1_000_000) / 1000);
}

/**
 * Customer price in kobo: cost × rate × (1 + markup), rounded UP to the next ₦10.
 * costMilli: provider price in 1/1000 US$. rateKobo: kobo per US$1. markupBps: 30000 = +300%.
 */
export function sellPriceKobo(costMilli: number, rateKobo: number, markupBps: number): number {
  if (!(costMilli > 0) || !(rateKobo > 0)) return 0;
  const costKobo = (costMilli * rateKobo) / 1000;
  const withMarkup = (costKobo * (10_000 + Math.max(0, markupBps))) / 10_000;
  return Math.ceil(withMarkup / 1000) * 1000;
}

export type VerifyOutcome = "pending" | "completed" | "refunded";

/**
 * What a provider state means for the customer. A code we already have always wins
 * (state can lag behind the SMS). No code + finished = refund.
 */
export function outcomeFor(state: string, hasCode: boolean): VerifyOutcome {
  if (hasCode) return "completed";
  if (state === "verificationPending" || state === "verificationReactivated") return "pending";
  return "refunded";
}

/** Best guess at the code in an SMS when the provider didn't parse one: 4–8 digits. */
export function extractCode(text: string): string | null {
  const m = /\b(\d{3}[- ]?\d{3}|\d{4,8})\b/.exec(text);
  return m ? m[1].replace(/[- ]/g, "") : null;
}

/** Friendly service name: "whatsapp" → "Whatsapp", "google_voice" → "Google voice". */
export function serviceLabel(name: string): string {
  const s = name.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
}
