/**
 * Rate limits, daily quotas and throttles, backed by Postgres (works across Vercel's many function instances).
 * Each rule counts requests per key in a fixed time window; going over throws a 429 (or returns false when silent).
 * Keys are HMAC-hashed so no IP address or email is stored; the rule name is kept for the admin "Limits" page.
 *
 * - Every rule `x` with a matching `xDay` rule is ALSO checked against the daily quota automatically.
 * - The owner can change any limit in Admin › Limits & usage (app_settings `rate_limit_overrides`).
 * - If the counter itself fails (database hiccup), the request is allowed rather than blocked.
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { retryAfterSec, waitText, windowStart } from "@/core/rateLimit";
import { readSetting } from "./appSettings";
import type { DbOrTx } from "./db";
import { env } from "./env";
import { AppError } from "./errors";

export type Rule = { max: number; windowSec: number };
const MIN = 60, HOUR = 3600, DAY = 86400;

/** Default limits. Tuned so normal customers never see them. */
export const LIMITS = {
  // ---- whole site (applied to every API request in route()) ----
  writeIp: { max: 300, windowSec: 10 * MIN },          // changes (POST/DELETE) per signed-in customer, or per network for visitors
  writeNet: { max: 3_000, windowSec: 10 * MIN },       // backstop: changes from one network in total (shared mobile IPs)
  catalogIp: { max: 300, windowSec: 10 * MIN },        // catalogue/search reads per customer (or network for visitors)
  // ---- sign-in and account ----
  loginIp: { max: 100, windowSec: 15 * MIN },   // per network (many customers share mobile IPs)
  loginEmail: { max: 10, windowSec: 15 * MIN },
  loginEmailDay: { max: 40, windowSec: DAY },
  registerIp: { max: 30, windowSec: HOUR },
  registerIpDay: { max: 200, windowSec: DAY },
  password: { max: 6, windowSec: 15 * MIN },
  emailCodeUser: { max: 6, windowSec: HOUR },          // codes emailed to one account
  emailCodeUserDay: { max: 20, windowSec: DAY },
  emailCodeIp: { max: 60, windowSec: HOUR },           // codes emailed from one network
  emailCodeCheck: { max: 60, windowSec: 15 * MIN },    // code guesses from one network (each code also allows only 5 tries)
  nameChange: { max: 12, windowSec: HOUR },
  nameChangeDay: { max: 20, windowSec: DAY },
  apiKey: { max: 10, windowSec: HOUR },
  apiKeyDay: { max: 20, windowSec: DAY },
  // ---- money ----
  fund: { max: 10, windowSec: 10 * MIN },
  fundDay: { max: 40, windowSec: DAY },
  fundCheck: { max: 30, windowSec: 10 * MIN },          // "check my payment" button
  withdraw: { max: 5, windowSec: HOUR },
  withdrawDay: { max: 10, windowSec: DAY },
  bankAccount: { max: 10, windowSec: HOUR },
  bankAccountDay: { max: 20, windowSec: DAY },
  bankCheck: { max: 30, windowSec: HOUR },
  // ---- buying ----
  order: { max: 30, windowSec: MIN },                   // Boost orders
  orderDay: { max: 500, windowSec: DAY },
  buy: { max: 20, windowSec: MIN },                     // gift cards, airtime, eSIMs, shop, P2P, sell desk
  buyDay: { max: 200, windowSec: DAY },
  verifyStart: { max: 10, windowSec: 10 * MIN },        // phone numbers rented
  verifyStartDay: { max: 40, windowSec: DAY },
  verifyQuote: { max: 60, windowSec: MIN },             // price checks (all instant products)
  verifyQuoteDay: { max: 1500, windowSec: DAY },
  shipQuote: { max: 30, windowSec: HOUR },
  shipQuoteDay: { max: 100, windowSec: DAY },
  shipBook: { max: 20, windowSec: HOUR },
  shipBookDay: { max: 40, windowSec: DAY },
  trackParcel: { max: 60, windowSec: HOUR },
  // ---- P2P, sellers, support ----
  tradeAction: { max: 30, windowSec: MIN },
  tradeActionDay: { max: 300, windowSec: DAY },
  message: { max: 20, windowSec: MIN },
  messageDay: { max: 500, windowSec: DAY },
  sellerApply: { max: 5, windowSec: HOUR },
  sellerApplyDay: { max: 10, windowSec: DAY },
  avatar: { max: 10, windowSec: HOUR },
  avatarDay: { max: 20, windowSec: DAY },
  listingWrite: { max: 30, windowSec: HOUR },
  listingWriteDay: { max: 100, windowSec: DAY },
  listingPhoto: { max: 60, windowSec: HOUR },
  listingPhotoDay: { max: 200, windowSec: DAY },
  support: { max: 40, windowSec: HOUR },
  supportDay: { max: 150, windowSec: DAY },
  whatsapp: { max: 20, windowSec: 10 * MIN },           // WhatsApp messages the AI answers, per number
  whatsappDay: { max: 200, windowSec: DAY },
  whatsappLink: { max: 8, windowSec: HOUR },            // "LINK code" / email-code tries per number
  whatsappEmail: { max: 3, windowSec: HOUR },           // connect-by-email codes sent to one email address
  // ---- reseller API ----
  resellerApi: { max: 120, windowSec: MIN },
  resellerApiDay: { max: 50_000, windowSec: DAY },
  apiKeyFail: { max: 20, windowSec: HOUR },             // wrong API keys from one network (then blocked)
  // ---- cost control ----
  upstreamPoll: { max: 1, windowSec: 10 },              // supplier status checks per order (customer polling)
  emailNotice: { max: 2_000, windowSec: DAY },          // all notification emails (whole site, per day)
  emailTo: { max: 40, windowSec: DAY },                 // notification emails to one address per day
  track: { max: 120, windowSec: MIN },                  // analytics beacon (silent)
} satisfies Record<string, Rule>;

export type LimitName = keyof typeof LIMITS;

/** Plain-English labels for the admin page. */
export const LIMIT_LABELS: Record<LimitName, string> = {
  writeIp: "Any change (form sends, orders…) per customer",
  writeNet: "Any change from one network in total (backstop for shared mobile networks)",
  catalogIp: "Browsing the service list per customer",
  loginIp: "Log in attempts from one network",
  loginEmail: "Log in attempts for one email",
  loginEmailDay: "Log in attempts for one email (daily)",
  registerIp: "Sign-ups from one network",
  registerIpDay: "Sign-ups from one network (daily)",
  password: "Password changes",
  emailCodeUser: "Login codes emailed to one account",
  emailCodeUserDay: "Login codes emailed to one account (daily)",
  emailCodeIp: "Login codes requested from one network",
  emailCodeCheck: "Code guesses from one network",
  nameChange: "Name change requests",
  nameChangeDay: "Name change requests (daily)",
  apiKey: "Reseller API keys created",
  apiKeyDay: "Reseller API keys created (daily)",
  fund: "Top-up attempts",
  fundDay: "Top-up attempts (daily)",
  fundCheck: "\"Check my payment\" taps",
  withdraw: "Withdrawal requests",
  withdrawDay: "Withdrawal requests (daily)",
  bankAccount: "Bank transfer accounts created",
  bankAccountDay: "Bank transfer accounts created (daily)",
  bankCheck: "\"I've sent it\" checks",
  order: "Boost orders",
  orderDay: "Boost orders (daily)",
  buy: "Purchases (gift cards, airtime, eSIMs, shop, P2P, sell desk)",
  buyDay: "Purchases (daily)",
  verifyStart: "Verification numbers rented",
  verifyStartDay: "Verification numbers rented (daily)",
  verifyQuote: "Price checks",
  verifyQuoteDay: "Price checks (daily)",
  shipQuote: "Package price quotes",
  shipQuoteDay: "Package price quotes (daily)",
  shipBook: "Package bookings",
  shipBookDay: "Package bookings (daily)",
  trackParcel: "Public parcel tracking look-ups",
  tradeAction: "P2P trade actions",
  tradeActionDay: "P2P trade actions (daily)",
  message: "P2P chat messages",
  messageDay: "P2P chat messages (daily)",
  sellerApply: "Seller applications",
  sellerApplyDay: "Seller applications (daily)",
  avatar: "Shop picture uploads",
  avatarDay: "Shop picture uploads (daily)",
  listingWrite: "P2P ads posted or edited",
  listingWriteDay: "P2P ads posted or edited (daily)",
  listingPhoto: "P2P ad photo uploads",
  listingPhotoDay: "P2P ad photo uploads (daily)",
  support: "Support chat messages",
  supportDay: "Support chat messages (daily)",
  whatsapp: "WhatsApp assistant messages per number",
  whatsappDay: "WhatsApp assistant messages per number (daily)",
  whatsappLink: "WhatsApp link-code tries per number",
  whatsappEmail: "WhatsApp connect-by-email codes per email address",
  resellerApi: "Reseller API requests per key",
  resellerApiDay: "Reseller API requests per key (daily)",
  apiKeyFail: "Wrong reseller API keys from one network (then that network is blocked)",
  upstreamPoll: "Supplier status checks per order (saves supplier calls)",
  emailNotice: "Notification emails, whole site (daily budget)",
  emailTo: "Notification emails to one address (daily)",
  track: "Visitor analytics events",
};

const hash = (s: string) => createHmac("sha256", env().SESSION_SECRET).update(s).digest("base64url").slice(0, 32);

/* ---------- owner overrides (cached for a minute per server instance) ---------- */
let overrides: Partial<Record<LimitName, Rule>> = {};
let loadedAt = 0;
async function rules(db: DbOrTx) {
  if (Date.now() - loadedAt > 60_000) {
    loadedAt = Date.now();
    overrides = await readSetting<Partial<Record<LimitName, Rule>>>(db, "rate_limit_overrides", {}).catch(() => overrides);
  }
  return overrides;
}
export function clearLimitCache() { loadedAt = 0; }
export async function effectiveRule(db: DbOrTx, name: LimitName): Promise<Rule> {
  const o = (await rules(db))[name];
  return o ? { ...LIMITS[name], ...o } : LIMITS[name];
}

/**
 * Who to count a request against: the signed-in session (so customers sharing one mobile-network IP don't block each
 * other), else the network. The session cookie is only hashed here, not verified; the network backstop (writeNet and
 * the in-memory burst ceiling) still catches anyone rotating fake cookies.
 */
export function callerKey(req: Request): string {
  const m = /(?:^|;\s*)ap_session=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m ? `s:${createHmac("sha256", "caller").update(m[1]).digest("base64url").slice(0, 24)}` : `ip:${clientIp(req)}`;
}

/** The caller's IP as Vercel reports it. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** Count one request for one rule; false when over the limit. */
async function hit(db: DbOrTx, name: LimitName, id: string, rule: Rule): Promise<boolean> {
  const start = new Date(windowStart(Date.now(), rule.windowSec));
  const r = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count, rule) VALUES (${hash(`${name}:${id}`)}, ${start}, 1, ${name})
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  return Number(r.rows[0]?.count ?? 0) <= rule.max;
}

/**
 * Count one request for `name` + `id` (and its daily quota `nameDay`, if there is one); throw 429 when over.
 * With { silent: true } returns false instead of throwing.
 */
export async function rateLimit(db: DbOrTx, name: LimitName, id: string, opts: { silent?: boolean } = {}) {
  const names = [name, `${name}Day`].filter((n): n is LimitName => n in LIMITS);
  for (const n of names) {
    let ok = true, rule: Rule = LIMITS[n];
    try {
      rule = await effectiveRule(db, n);
      ok = await hit(db, n, id, rule);
    } catch (e) {
      console.error("[rate-limit] counter failed, allowing request", e);
      return true;
    }
    if (ok) continue;
    if (opts.silent) return false;
    const wait = retryAfterSec(Date.now(), rule.windowSec);
    const msg = rule.windowSec >= DAY
      ? `You've reached today's limit for this. It resets in ${waitText(wait)}. Need more? Message support.`
      : `Too many attempts. Please wait ${waitText(wait)} and try again.`;
    throw new AppError(429, "RATE_LIMITED", msg, { retryAfterSec: wait });
  }
  return true;
}

/** Is `name` + `id` already over its limit? (reads only, doesn't count) */
export async function isOverLimit(db: DbOrTx, name: LimitName, id: string) {
  try {
    const rule = await effectiveRule(db, name);
    const start = new Date(windowStart(Date.now(), rule.windowSec));
    const r = await db.execute<{ count: number }>(sql`SELECT count FROM rate_limits WHERE key = ${hash(`${name}:${id}`)} AND window_start = ${start}`);
    return Number(r.rows[0]?.count ?? 0) > rule.max;
  } catch { return false; }
}

/** Cron housekeeping: drop counters older than a day (daily quotas reset at midnight UTC). */
export async function pruneRateLimits(db: DbOrTx) {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}

/* ---------- admin: usage in the last 24 hours ---------- */
export async function limitUsage(db: DbOrTx) {
  const r = await db.execute<{ rule: string; count: number }>(sql`
    SELECT rule, count FROM rate_limits WHERE rule IS NOT NULL AND window_start > now() - interval '1 day' LIMIT 100000`);
  const ov = await rules(db);
  const stats: Record<string, { requests: number; blocked: number; keys: number }> = {};
  for (const row of r.rows) {
    const name = row.rule as LimitName;
    if (!(name in LIMITS)) continue;
    const max = (ov[name] ?? LIMITS[name]).max;
    const s = (stats[name] ??= { requests: 0, blocked: 0, keys: 0 });
    const c = Number(row.count);
    s.requests += Math.min(c, max); s.blocked += Math.max(0, c - max); s.keys += 1;
  }
  return (Object.keys(LIMITS) as LimitName[]).map((name) => ({
    name, label: LIMIT_LABELS[name], defaults: LIMITS[name], current: { ...LIMITS[name], ...(ov[name] ?? {}) },
    overridden: !!ov[name], ...(stats[name] ?? { requests: 0, blocked: 0, keys: 0 }),
  }));
}
