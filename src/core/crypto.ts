/**
 * Small crypto helpers built on Node's standard library only.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using your secret key. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Payment reference, e.g. AP-FUND-20261103-k3J9xQ2mPq */
export function paymentReference(kind: string, now = new Date()): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `AP-${kind.toUpperCase()}-${d}-${randomToken(10)}`;
}

/** Reseller API keys: shown once, stored only as a SHA-256 hash. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `ap_live_${randomToken(40)}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
