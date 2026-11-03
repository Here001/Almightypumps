/**
 * Small crypto helpers built on Node's standard library only.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function safeEqual(x: string, y: string): boolean {
  const a = Buffer.from(x, "utf8");
  const b = Buffer.from(y, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Flutterwave webhooks carry the "secret hash" set in the dashboard, either as the
 * `verif-hash` header (plain value) or as `flutterwave-signature`
 * (base64 HMAC-SHA256 of the raw body keyed with that hash). Accept either.
 */
export function verifyFlutterwaveWebhook(
  rawBody: string,
  headers: { verifHash: string | null; signature: string | null },
  secretHash: string,
): boolean {
  if (!secretHash) return false;
  if (headers.verifHash && safeEqual(headers.verifHash.trim(), secretHash)) return true;
  if (headers.signature) {
    const expected = createHmac("sha256", secretHash).update(rawBody, "utf8").digest("base64");
    return safeEqual(headers.signature.trim(), expected);
  }
  return false;
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
