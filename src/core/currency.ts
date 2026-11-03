/**
 * Display currency. Money is always stored and charged in kobo (Naira); dollars are a
 * display conversion using the admin-set rate (kobo per US$1, e.g. ₦1,600 → 160000).
 */
export type DisplayCurrency = "NGN" | "USD";

export function formatNaira(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatUsd(kobo: number, usdRateKobo: number): string {
  if (!(usdRateKobo > 0)) return formatNaira(kobo);
  const dollars = kobo / usdRateKobo;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs === 0) return "$0.00";
  // Tiny per-1,000 prices (e.g. $0.00024) keep 2 significant digits instead of rounding to $0.00.
  const digits = abs < 0.01
    ? abs.toLocaleString("en-US", { maximumSignificantDigits: 2 })
    : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign + "$" + digits;
}

export function formatMoney(kobo: number, currency: DisplayCurrency, usdRateKobo: number): string {
  return currency === "USD" && usdRateKobo > 0 ? formatUsd(kobo, usdRateKobo) : formatNaira(kobo);
}

/** Dollar-rate settings (stored as one JSON value under app_settings "usd"). */
export type UsdConfig = {
  mode: "auto" | "manual";
  /** Manual rate, kobo per US$1. */
  manualKobo: number;
  /** Last rate fetched from the market feed, kobo per US$1. */
  marketKobo: number;
  /** Auto mode: adjust the market rate by this many basis points (e.g. 300 = +3%). */
  adjustBps: number;
  updatedAt: string | null;
  source: string | null;
  lastError: string | null;
};

export const DEFAULT_USD_CONFIG: UsdConfig = {
  mode: "auto", manualKobo: 0, marketKobo: 0, adjustBps: 0, updatedAt: null, source: null, lastError: null,
};

/** The rate customers see (kobo per US$1); 0 means dollar prices are off. */
export function effectiveUsdRate(cfg: UsdConfig): number {
  if (cfg.mode === "manual") return cfg.manualKobo > 0 ? Math.round(cfg.manualKobo) : 0;
  if (!(cfg.marketKobo > 0)) return 0;
  return Math.max(1, Math.round((cfg.marketKobo * (10_000 + cfg.adjustBps)) / 10_000));
}

/** Parse an open.er-api.com style response ({ rates: { NGN: 1534.2 } }) into kobo per US$1. */
export function parseUsdNgn(json: unknown): number {
  const ngn = (json as { rates?: Record<string, unknown> } | null)?.rates?.NGN;
  const n = typeof ngn === "number" ? ngn : Number(ngn);
  if (!Number.isFinite(n) || n < 100 || n > 100_000) throw new Error("Exchange-rate feed returned no usable NGN rate");
  return Math.round(n * 100);
}
