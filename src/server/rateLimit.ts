/**
 * Rate limiting backed by Postgres (works across Vercel's many function instances).
 * Each rule counts requests per key in a fixed time window; going over throws a 429.
 * Keys are HMAC-hashed so no IP address or email is stored.
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { retryAfterSec, waitText, windowStart } from "@/core/rateLimit";
import type { DbOrTx } from "./db";
import { env } from "./env";
import { AppError } from "./errors";

export type Rule = { max: number; windowSec: number };

/** Limits per action. Tuned so normal customers never see them. */
export const LIMITS = {
  loginIp: { max: 30, windowSec: 15 * 60 },
  loginEmail: { max: 10, windowSec: 15 * 60 },
  registerIp: { max: 6, windowSec: 60 * 60 },
  password: { max: 6, windowSec: 15 * 60 },
  fund: { max: 10, windowSec: 10 * 60 },
  withdraw: { max: 5, windowSec: 60 * 60 },
  order: { max: 30, windowSec: 60 },
  buy: { max: 20, windowSec: 60 },
  tradeAction: { max: 30, windowSec: 60 },
  message: { max: 20, windowSec: 60 },
  verifyStart: { max: 10, windowSec: 10 * 60 },
  verifyQuote: { max: 60, windowSec: 60 },
  sellerApply: { max: 5, windowSec: 60 * 60 },
  avatar: { max: 10, windowSec: 60 * 60 },
  listingWrite: { max: 30, windowSec: 60 * 60 },
  apiKey: { max: 10, windowSec: 60 * 60 },
  resellerApi: { max: 120, windowSec: 60 },
  track: { max: 120, windowSec: 60 },
} satisfies Record<string, Rule>;

const hash = (s: string) => createHmac("sha256", env().SESSION_SECRET).update(s).digest("base64url").slice(0, 32);

/** The caller's IP as Vercel reports it. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Count one request for `name` + `id`; throw 429 when over the rule's limit.
 * If the counter itself fails (database hiccup), the request is allowed rather than blocked.
 */
export async function rateLimit(db: DbOrTx, name: keyof typeof LIMITS, id: string, opts: { silent?: boolean } = {}) {
  const rule = LIMITS[name];
  const now = Date.now();
  const start = new Date(windowStart(now, rule.windowSec));
  let count = 0;
  try {
    const r = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${hash(`${name}:${id}`)}, ${start}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`);
    count = Number(r.rows[0]?.count ?? 0);
  } catch (e) {
    console.error("[rate-limit] counter failed, allowing request", e);
    return true;
  }
  if (count <= rule.max) return true;
  if (opts.silent) return false;
  const wait = retryAfterSec(now, rule.windowSec);
  throw new AppError(429, "RATE_LIMITED", `Too many attempts. Please wait ${waitText(wait)} and try again.`, { retryAfterSec: wait });
}

/** Cron housekeeping: drop counters older than a day. */
export async function pruneRateLimits(db: DbOrTx) {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
