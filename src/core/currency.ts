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
