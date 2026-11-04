/**
 * Encrypt small secrets (provider API keys) before storing them in the database.
 * AES-256-GCM with a key derived from SESSION_SECRET. Changing SESSION_SECRET means
 * provider keys saved in the admin must be pasted again.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

const key = () => createHash("sha256").update(`provider-keys:v1:${env().SESSION_SECRET}`).digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${c.getAuthTag().toString("base64url")}`;
}

export function open(sealed: string): string {
  const [v, iv, body, tag] = sealed.split(".");
  if (v !== "v1" || !iv || !body || !tag) throw new Error("Unreadable stored key");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** "••••abcd" style hint so the admin can recognise a key without seeing it. */
export const keyHint = (k: string) => k.trim().slice(-4);
