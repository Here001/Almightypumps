/** Pure helpers for "Send a Package" (prices, addresses). */

export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/** Countries a parcel can be sent from / to (owner's choice: within Nigeria and USA → Nigeria). */
export const SHIP_FROM = ["NG", "US"] as const;
export const SHIP_TO = ["NG"] as const;

/** Customer price in kobo: carrier cost + markup, rounded UP to the next ₦50. */
export function shippingPrice(costKobo: number, markupBps: number, roundToKobo = 5_000): number {
  if (!Number.isFinite(costKobo) || costKobo <= 0) throw new Error("Bad carrier price");
  const withMarkup = Math.ceil((costKobo * (10_000 + Math.max(0, markupBps))) / 10_000);
  return Math.ceil(withMarkup / roundToKobo) * roundToKobo;
}

/** Nigerian phone to international format (+234…); other numbers are kept, with a leading + if missing. */
export function intlPhone(phone: string, country: string): string {
  const p = phone.replace(/[\s()-]/g, "");
  if (country === "NG") {
    if (/^0[789]\d{9}$/.test(p)) return "+234" + p.slice(1);
    if (/^234[789]\d{9}$/.test(p)) return "+" + p;
  }
  if (country === "US" && /^\d{10}$/.test(p)) return "+1" + p;
  return p.startsWith("+") ? p : "+" + p;
}

/** Our own tracking number: "AP" + 8 characters with no look-alikes (0/O, 1/I/L). */
export function shipmentCode(random: Uint8Array): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "AP" + Array.from(random.slice(0, 8), (b) => A[b % A.length]).join("");
}
