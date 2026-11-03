/**
 * Money is always stored and computed as integer kobo (1 naira = 100 kobo).
 * Never use floats for balances. Every function here is pure.
 */

export type Kobo = number;

export class MoneyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

export function assertKobo(value: number, label = "amount"): Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("NOT_INTEGER", `${label} must be a whole number of kobo`);
  }
  if (value < 0) {
    throw new MoneyError("NEGATIVE", `${label} cannot be negative`);
  }
  return value;
}

export function assertPositiveKobo(value: number, label = "amount"): Kobo {
  assertKobo(value, label);
  if (value === 0) throw new MoneyError("ZERO", `${label} must be greater than zero`);
  return value;
}

/** Parse a naira amount typed by a person ("1,250", "1250.5", "₦1,250.50") into kobo. */
export function nairaToKobo(input: string | number): Kobo {
  const raw = typeof input === "number" ? String(input) : input;
  const cleaned = raw.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new MoneyError("INVALID_FORMAT", "Enter an amount like 1500 or 1500.50");
  }
  const [whole, frac = ""] = cleaned.split(".");
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return assertKobo(kobo);
}

export function formatNaira(kobo: Kobo): string {
  assertKobo(Math.abs(kobo));
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100);
  const k = abs % 100;
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}₦${grouped}.${k.toString().padStart(2, "0")}`;
}

/** Fee in basis points (100 bps = 1%), rounded down so we never over-charge. */
export function feeBps(amount: Kobo, bps: number): Kobo {
  assertKobo(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new MoneyError("INVALID_BPS", "Fee must be between 0 and 10000 basis points");
  }
  return Math.floor((amount * bps) / 10_000);
}

/** amount * part / whole, rounded down. Used for partial deliveries. */
export function proportion(amount: Kobo, part: number, whole: number): Kobo {
  assertKobo(amount);
  if (!Number.isInteger(part) || !Number.isInteger(whole) || whole <= 0 || part < 0 || part > whole) {
    throw new MoneyError("INVALID_PROPORTION", "Part must be between 0 and whole");
  }
  return Math.floor((amount * part) / whole);
}
