import { getDb } from "@/server/db";
import { requireCron, route } from "@/server/http";
import { syncOrders } from "@/server/smm";
import { refreshUsdRate } from "@/server/pricing";
import { sweepVerifications } from "@/server/smsVerify";
import { pruneRateLimits } from "@/server/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  requireCron(req);
  const db = getDb();
  const orders = await syncOrders(db);
  // Keep the automatic dollar rate fresh (only fetches when it's older than 6 hours).
  const fx = await refreshUsdRate(db).catch(() => null);
  // Settle verification codes customers left waiting (code arrived, or refund when none came).
  await pruneRateLimits(db).catch(() => null);
  const verify = await sweepVerifications(db).catch((e) => { console.error("[cron] verify sweep", e); return null; });
  return { ...orders, usdRateRefreshed: fx?.refreshed ?? false, verifyChecked: verify?.checked ?? 0 };
});
