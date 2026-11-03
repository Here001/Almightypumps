import { getDb } from "@/server/db";
import { requireCron, route } from "@/server/http";
import { syncOrders } from "@/server/smm";
import { refreshUsdRate } from "@/server/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  requireCron(req);
  const db = getDb();
  const orders = await syncOrders(db);
  // Keep the automatic dollar rate fresh (only fetches when it's older than 6 hours).
  const fx = await refreshUsdRate(db).catch(() => null);
  return { ...orders, usdRateRefreshed: fx?.refreshed ?? false };
});
