import { getDb } from "@/server/db";
import { requireCron, route } from "@/server/http";
import { retryQueuedOrders, syncOrders } from "@/server/smm";
import { refreshUsdRate } from "@/server/pricing";
import { sweepVerifications } from "@/server/smsVerify";
import { pruneRateLimits } from "@/server/rateLimit";
import { sweepGiftOrders } from "@/server/giftCards";
import { sweepTopups } from "@/server/airtime";
import { sweepTravelOrders } from "@/server/travelEsim";
import { payReferrals } from "@/server/referrals";
import { sweepTransfers } from "@/server/bankTransfer";
import { movePhotosToBlob } from "@/server/listingImages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  requireCron(req);
  const db = getDb();
  const orders = await syncOrders(db);
  // Boost orders that were waiting for the provider's balance to be topped up.
  const queued = await retryQueuedOrders(db).catch((e) => { console.error("[cron] queued retry", e); return null; });
  // Keep the automatic dollar rate fresh (only fetches when it's older than 6 hours).
  const fx = await refreshUsdRate(db).catch(() => null);
  // Settle verification codes customers left waiting (code arrived, or refund when none came).
  await pruneRateLimits(db).catch(() => null);
  const verify = await sweepVerifications(db).catch((e) => { console.error("[cron] verify sweep", e); return null; });
  // Settle gift cards, top-ups and travel eSIMs that were still processing (and re-sync catalogues daily).
  const [gift, topup, travel] = await Promise.all([
    sweepGiftOrders(db).catch((e) => { console.error("[cron] gift sweep", e); return null; }),
    sweepTopups(db).catch((e) => { console.error("[cron] topup sweep", e); return null; }),
    sweepTravelOrders(db).catch((e) => { console.error("[cron] travel sweep", e); return null; }),
  ]);
  // Invite bonuses for friends who have now spent enough.
  const referrals = await payReferrals(db).catch((e) => { console.error("[cron] referrals", e); return null; });
  // Bank-transfer top-ups whose webhook didn't arrive.
  const transfers = await sweepTransfers(db).catch((e) => { console.error("[cron] transfers", e); return null; });
  // Older ad photos: move them out of the database into file storage, a few each run.
  const photos = await movePhotosToBlob(db).catch((e) => { console.error("[cron] photos", e); return null; });
  return { ...orders, photosMoved: photos?.moved ?? 0, transfersChecked: transfers?.checked ?? 0, referralsPaid: referrals?.paid ?? 0, queuedSent: queued?.sent ?? 0, queuedWaiting: queued ? queued.queued - queued.sent - queued.refunded : 0, giftChecked: gift?.checked ?? 0, topupChecked: topup?.checked ?? 0, travelChecked: travel?.checked ?? 0, usdRateRefreshed: fx?.refreshed ?? false, verifyChecked: verify?.checked ?? 0 };
});
