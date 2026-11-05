import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { trackPublic } from "@/server/shipping";

export const dynamic = "force-dynamic";

/** Public parcel tracking (no login): /api/parcels/track?code=AP… or the courier's tracking number. */
export const GET = route(async (req: Request) => {
  const db = getDb();
  await rateLimit(db, "trackParcel", clientIp(req));
  return trackPublic(db, new URL(req.url).searchParams.get("code") ?? "");
});
