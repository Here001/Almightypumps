/**
 * Reloadly client: gift cards and airtime/data top-ups.
 * Auth: POST https://auth.reloadly.com/oauth/token (client_credentials, audience = product base URL) → bearer.
 * Sandbox keys and live keys are different; RELOADLY_ENV picks one, otherwise live on production and sandbox
 * elsewhere, falling back to the other if the keys are refused (and remembering which worked).
 */
import { env } from "./env";
import { AppError } from "./errors";

type Product = "giftcards" | "topups";
type Mode = "sandbox" | "live";

const ACCEPT: Record<Product, string> = {
  giftcards: "application/com.reloadly.giftcards-v1+json",
  topups: "application/com.reloadly.topups-v1+json",
};

export function reloadlyConfigured() {
  const e = env();
  return Boolean(e.RELOADLY_CLIENT_ID && e.RELOADLY_CLIENT_SECRET);
}

const realBase = (product: Product, mode: Mode) => `https://${product}${mode === "sandbox" ? "-sandbox" : ""}.reloadly.com`;
function baseUrl(product: Product, mode: Mode) {
  const mock = env().RELOADLY_MOCK_URL.replace(/\/+$/, "");
  return mock ? `${mock}/${product}-${mode}` : realBase(product, mode);
}
const authUrl = () => (env().RELOADLY_MOCK_URL ? `${env().RELOADLY_MOCK_URL.replace(/\/+$/, "")}/oauth/token` : "https://auth.reloadly.com/oauth/token");

let workingMode: Mode | null = null;
const tokens = new Map<string, { token: string; expiresAt: number }>();

function preferredModes(): Mode[] {
  const forced = env().RELOADLY_ENV;
  if (forced) return [forced];
  if (workingMode) return [workingMode];
  return process.env.VERCEL_ENV === "production" ? ["live", "sandbox"] : ["sandbox", "live"];
}

export function reloadlyMode(): Mode | null {
  return env().RELOADLY_ENV || workingMode;
}

function providerError(status: number, text: string) {
  let msg = text.slice(0, 200);
  try {
    const j = JSON.parse(text) as { message?: string; errorCode?: string; error?: string };
    msg = j.message ?? j.error ?? msg;
  } catch { /* plain text */ }
  console.error(`[reloadly] ${status} ${msg}`);
  return new AppError(502, "PROVIDER_ERROR", msg || `Provider error ${status}`, { status });
}

async function tokenFor(product: Product, mode: Mode): Promise<string> {
  const key = `${product}:${mode}`;
  const t = tokens.get(key);
  if (t && t.expiresAt - 5 * 60_000 > Date.now()) return t.token;
  const e = env();
  const res = await fetch(authUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: e.RELOADLY_CLIENT_ID, client_secret: e.RELOADLY_CLIENT_SECRET, grant_type: "client_credentials", audience: realBase(product, mode) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw providerError(res.status, text);
  const j = JSON.parse(text) as { access_token: string; expires_in?: number };
  tokens.set(key, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

/** Find a mode whose keys work (the first call decides; later calls reuse it). */
async function auth(product: Product): Promise<{ token: string; mode: Mode }> {
  if (!reloadlyConfigured()) throw new AppError(503, "NOT_CONFIGURED", "This service isn't set up yet. Please check back soon.");
  let last: unknown;
  for (const mode of preferredModes()) {
    try {
      const token = await tokenFor(product, mode);
      if (workingMode !== mode) console.log(`[reloadly] using ${mode} keys`);
      workingMode = mode;
      return { token, mode };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof AppError
    ? new AppError(502, "PROVIDER_ERROR", "Reloadly rejected our keys. Check RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET in Vercel.", { status: 401 })
    : last;
}

export async function rl<T = unknown>(product: Product, method: string, path: string, json?: unknown, timeoutMs = 25_000): Promise<T> {
  const send = async () => {
    const { token, mode } = await auth(product);
    return fetch(`${baseUrl(product, mode)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT[product], ...(json !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  };
  let res = await send();
  if (res.status === 401) { tokens.clear(); res = await send(); }
  const text = await res.text();
  if (!res.ok) throw providerError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/* ---------- Gift cards ---------- */

export type RlGiftTx = { transactionId: number; amount?: number; fee?: number; discount?: number; currencyCode?: string; status?: string };
export type RlCard = { cardNumber?: string | null; pinCode?: string | null; redemptionUrl?: string | null };

export const ReloadlyGift = {
  balance: () => rl<{ balance: number; currencyCode: string }>("giftcards", "GET", "/accounts/balance"),
  countryProducts: (iso: string, page: number) =>
    rl<{ content?: Record<string, unknown>[]; totalPages?: number } | Record<string, unknown>[]>("giftcards", "GET", `/countries/${encodeURIComponent(iso)}/products?page=${page}&size=200`),
  product: (id: number) => rl<Record<string, unknown>>("giftcards", "GET", `/products/${id}`),
  order: (input: { productId: number; countryCode: string; unitPrice: number; customIdentifier: string }) =>
    rl<RlGiftTx>("giftcards", "POST", "/orders", { ...input, quantity: 1, senderName: "Almighty Pumps" }, 45_000),
  transaction: (id: string) => rl<RlGiftTx>("giftcards", "GET", `/reports/transactions/${encodeURIComponent(id)}`),
  findByCustomId: async (customId: string) => {
    const r = await rl<{ content?: (RlGiftTx & { customIdentifier?: string })[] }>("giftcards", "GET", `/reports/transactions?page=1&size=5&customIdentifier=${encodeURIComponent(customId)}`);
    return (r.content ?? []).find((t) => t.customIdentifier === customId) ?? null;
  },
  cards: (id: string) => rl<RlCard[]>("giftcards", "GET", `/orders/transactions/${encodeURIComponent(id)}/cards`),
};

/* ---------- Airtime / data ---------- */

export type RlOperator = Record<string, unknown> & { operatorId?: number; id?: number; name?: string };
export type RlTopup = { transactionId?: number; status?: string; requestedAmount?: number; requestedAmountCurrencyCode?: string; deliveredAmount?: number; customIdentifier?: string };

export const ReloadlyTopup = {
  balance: () => rl<{ balance: number; currencyCode: string }>("topups", "GET", "/accounts/balance"),
  operators: (iso: string) =>
    rl<RlOperator[] | { content?: RlOperator[] }>("topups", "GET", `/operators/countries/${encodeURIComponent(iso)}?includeData=true&includeBundles=true&suggestedAmounts=true`),
  topup: (input: { operatorId: number; amount: number; customIdentifier: string; phone: string }) =>
    rl<RlTopup>("topups", "POST", "/topups", {
      operatorId: input.operatorId, amount: input.amount, useLocalAmount: false, customIdentifier: input.customIdentifier,
      recipientPhone: { countryCode: "NG", number: input.phone },
    }, 60_000),
  status: (txId: string) => rl<{ status?: string; transaction?: RlTopup }>("topups", "GET", `/topups/${encodeURIComponent(txId)}/status`),
  findByCustomId: async (customId: string) => {
    const r = await rl<{ content?: RlTopup[] }>("topups", "GET", `/topups/reports/transactions?page=1&size=5&customIdentifier=${encodeURIComponent(customId)}`);
    return (r.content ?? []).find((t) => t.customIdentifier === customId) ?? null;
  },
};
