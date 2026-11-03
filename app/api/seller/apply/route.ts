import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { applySchema, applyToSell, effectiveSellerStatus, mySellerProfile } from "@/server/sellers";

export const dynamic = "force-dynamic";

/** Your seller application (masked), if any. */
export const GET = route(async () => {
  const user = await requireUser();
  const db = getDb();
  return { sellerStatus: await effectiveSellerStatus(db, user.id, user.sellerStatus), profile: await mySellerProfile(db, user.id) };
});

/** Apply (or re-apply after a rejection). An admin reviews it in /admin/sellers. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, applySchema);
  return applyToSell(getDb(), user.id, input);
});
