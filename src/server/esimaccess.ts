/**
 * eSIM Access client (travel data eSIMs). Base https://api.esimaccess.com/api/v1/open, all calls POST JSON.
 * Every request is signed: RT-Signature = HMAC-SHA256(secret, timestamp + requestId + accessCode + body), hex.
 * Responses: { success, errorCode, errorMsg, obj }. Prices are US$ × 10,000.
 */
import { createHmac, randomUUID } from "node:crypto";
import { env } from "./env";
import { AppError } from "./errors";

export function esimAccessConfigured() {
  const e = env();
  return Boolean(e.ESIMACCESS_ACCESS_CODE && e.ESIMACCESS_SECRET_KEY);
}

export function esimAccessSignature(secret: string, timestamp: string, requestId: string, accessCode: string, body: string) {
  return createHmac("sha256", secret).update(timestamp + requestId + accessCode + body).digest("hex");
}

type Envelope<T> = { success?: boolean | string; errorCode?: string | null; errorMsg?: string | null; errorMessage?: string | null; obj?: T };

export async function ea<T = unknown>(path: string, payload: unknown = {}, timeoutMs = 25_000): Promise<T> {
  if (!esimAccessConfigured()) throw new AppError(503, "NOT_CONFIGURED", "Travel eSIMs aren't set up yet. Please check back soon.");
  const e = env();
  const body = JSON.stringify(payload);
  const ts = String(Date.now());
  const rid = randomUUID().replace(/-/g, "");
  const res = await fetch(`${e.ESIMACCESS_BASE_URL.replace(/\/+$/, "")}/api/v1/open${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "RT-AccessCode": e.ESIMACCESS_ACCESS_CODE,
      "RT-RequestID": rid,
      "RT-Timestamp": ts,
      "RT-Signature": esimAccessSignature(e.ESIMACCESS_SECRET_KEY, ts, rid, e.ESIMACCESS_ACCESS_CODE, body),
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let j: Envelope<T>;
  try { j = JSON.parse(text) as Envelope<T>; } catch {
    console.error(`[esimaccess] ${path} ${res.status} ${text.slice(0, 200)}`);
    throw new AppError(502, "PROVIDER_ERROR", `eSIM provider error ${res.status}`);
  }
  const ok = j.success === true || j.success === "true";
  if (!res.ok || !ok) {
    const msg = j.errorMsg ?? j.errorMessage ?? `error ${j.errorCode ?? res.status}`;
    console.error(`[esimaccess] ${path} ${res.status} ${j.errorCode ?? ""} ${msg}`);
    throw new AppError(502, "PROVIDER_ERROR", msg, { providerCode: j.errorCode ?? null });
  }
  return (j.obj ?? {}) as T;
}

export type EaPackage = {
  packageCode: string; slug?: string; name: string; price: number; currencyCode?: string; volume: number;
  duration: number; durationUnit?: string; location?: string; description?: string;
  locationNetworkList?: { locationName?: string; locationCode?: string }[];
};
export type EaEsim = {
  esimTranNo?: string; orderNo?: string; iccid?: string; ac?: string; qrCodeUrl?: string; smdpStatus?: string;
  esimStatus?: string; totalVolume?: number; orderUsage?: number; expiredTime?: string;
};

export const EsimAccess = {
  balance: () => ea<{ balance: number }>("/balance/query"),
  packages: () => ea<{ packageList?: EaPackage[] }>("/package/list", { locationCode: "", type: "BASE", packageCode: "", iccid: "" }, 50_000),
  packageByCode: (packageCode: string) => ea<{ packageList?: EaPackage[] }>("/package/list", { locationCode: "", type: "BASE", packageCode, iccid: "" }),
  /** Sending price + amount makes the provider refuse if its price changed (protects our margin). */
  order: (transactionId: string, packageCode: string, priceE4: number) =>
    ea<{ orderNo?: string }>("/esim/order", { transactionId, amount: priceE4, packageInfoList: [{ packageCode, count: 1, price: priceE4 }] }, 45_000),
  query: (orderNo: string) => ea<{ esimList?: EaEsim[] }>("/esim/query", { orderNo, iccid: "", pager: { pageNum: 1, pageSize: 10 } }),
  usage: (esimTranNo: string) => ea<{ esimUsageList?: { esimTranNo: string; dataUsage?: number; totalData?: number }[] }>("/esim/usage/query", { esimTranNoList: [esimTranNo] }),
  /** Cancel an unused profile: the provider refunds us. */
  cancel: (esimTranNo: string) => ea("/esim/cancel", { esimTranNo }),
};
