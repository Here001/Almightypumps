/**
 * TextVerified API v2 client (https://www.textverified.com/docs/api/v2).
 * Auth: POST /api/pub/v2/auth with X-API-KEY + X-API-USERNAME → short-lived bearer token.
 */
import { env } from "./env";
import { AppError } from "./errors";

type Token = { token: string; expiresAt: number };
let cached: Token | null = null;

export function textVerifiedConfigured() {
  const e = env();
  return Boolean(e.TEXTVERIFIED_API_KEY && e.TEXTVERIFIED_API_USERNAME);
}

const base = () => env().TEXTVERIFIED_BASE_URL.replace(/\/+$/, "");

function providerError(status: number, text: string) {
  let msg = text.slice(0, 200);
  try {
    const j = JSON.parse(text) as { errorDescription?: string; message?: string; title?: string };
    msg = j.errorDescription ?? j.message ?? j.title ?? msg;
  } catch { /* plain text */ }
  console.error(`[textverified] ${status} ${msg}`);
  return new AppError(502, "PROVIDER_ERROR", status === 401 || status === 403
    ? "Verification provider rejected our login. Check the TextVerified key and email."
    : `Verification provider error: ${msg || status}`);
}

async function token(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const e = env();
  if (!textVerifiedConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Verification codes aren't set up yet.");
  const res = await fetch(`${base()}/api/pub/v2/auth`, {
    method: "POST",
    headers: { "X-API-KEY": e.TEXTVERIFIED_API_KEY, "X-API-USERNAME": e.TEXTVERIFIED_API_USERNAME, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw providerError(res.status, text);
  const j = JSON.parse(text) as { token: string; expiresAt: string };
  cached = { token: j.token, expiresAt: Date.parse(j.expiresAt) || Date.now() + 10 * 60_000 };
  return cached.token;
}

/** Call the API. `path` may be absolute (the API returns full hrefs to follow). */
export async function tv<T = unknown>(method: string, path: string, opts: { json?: unknown; params?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${base()}${path}`);
  if (!url.href.startsWith(base())) throw new AppError(502, "PROVIDER_ERROR", "Unexpected provider link.");
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const send = async () =>
    fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json", ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  let res = await send();
  if (res.status === 401) { cached = null; res = await send(); }
  const text = await res.text();
  if (!res.ok) throw providerError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export type TvVerification = {
  id: string;
  number: string;
  state: string;
  endsAt: string;
  totalCost: number;
  serviceName: string;
  cancel?: { canCancel?: boolean };
};
export type TvSms = { id: string; smsContent?: string | null; parsedCode?: string | null; createdAt: string };

export const TextVerified = {
  account: () => tv<{ username: string; currentBalance: number }>("GET", "/api/pub/v2/account/me"),
  /** Services for one-time verifications. Accepts a bare array or { data: [...] }; logs the shape for debugging. */
  async services(numberType?: string): Promise<{ serviceName: string; capability?: string }[]> {
    const raw = await tv<unknown>("GET", "/api/pub/v2/services", { params: { reservationType: "verification", ...(numberType ? { numberType } : {}) } });
    const list = (Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
    console.log(`[textverified] services numberType=${numberType ?? "-"} type=${Array.isArray(raw) ? "array" : typeof raw} keys=${raw && !Array.isArray(raw) ? Object.keys(raw as object).join(",") : ""} count=${list.length} sample=${JSON.stringify(list.slice(0, 2)).slice(0, 300)}`);
    return list.map((s) => ({ serviceName: String(s.serviceName ?? s.name ?? ""), capability: s.capability === undefined ? undefined : String(s.capability) }));
  },
  price: (serviceName: string) =>
    tv<{ serviceName: string; price: number }>("POST", "/api/pub/v2/pricing/verifications", {
      json: { serviceName, areaCode: false, carrier: false, numberType: "mobile", capability: "sms" },
    }),
  async create(serviceName: string, maxPriceUsd: number): Promise<TvVerification> {
    const link = await tv<{ method: string; href: string }>("POST", "/api/pub/v2/verifications", { json: { serviceName, capability: "sms", maxPrice: maxPriceUsd } });
    return tv<TvVerification>(link.method || "GET", link.href);
  },
  get: (id: string) => tv<TvVerification>("GET", `/api/pub/v2/verifications/${encodeURIComponent(id)}`),
  cancel: (id: string) => tv("POST", `/api/pub/v2/verifications/${encodeURIComponent(id)}/cancel`),
  sms: (id: string) => tv<{ data?: TvSms[] }>("GET", "/api/pub/v2/sms", { params: { reservationId: id, reservationType: "verification" } }),
};
