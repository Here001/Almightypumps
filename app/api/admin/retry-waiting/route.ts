import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { retryQueuedOrders } from "@/server/smm";
import { sweepGiftOrders } from "@/server/giftCards";
import { sweepTopups } from "@/server/airtime";
import { sweepTravelOrders } from "@/server/travelEsim";
import { retryWaitingShipments } from "@/server/shipping";
import { adminCounts } from "@/server/adminHome";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin "Retry all now": after topping up a supplier, re-send every order that was waiting because the supplier's
 * balance was empty. Orders still short of money stay on hold (never refunded automatically).
 */
export const POST = route(async () => {
  await requireAdmin();
  const db = getDb();
  const safe = <T,>(p: Promise<T>) => p.catch((e) => { console.error("[retry-waiting]", e); return null; });
  const [boost, , , , ships] = await Promise.all([
    safe(retryQueuedOrders(db)), safe(sweepGiftOrders(db)), safe(sweepTopups(db)), safe(sweepTravelOrders(db)), safe(retryWaitingShipments(db)),
  ]);
  const left = (await adminCounts(db)).waitingFunds;
  const boostLeft = boost ? boost.queued - boost.sent - boost.refunded : 0;
  return { sent: (boost?.sent ?? 0) + (ships?.sent ?? 0), stillWaiting: left + Math.max(0, boostLeft) };
});
