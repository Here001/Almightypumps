import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { applySchema, applyToSell, mySellerProfile } from "@/server/sellers";

export const dynamic = "force-dynamic";

/** Your seller application (masked), if any. */
export const GET = route(async () => {
  const user = await requireUser();
  return { sellerStatus: user.sellerStatus, profile: await mySellerProfile(getDb(), user.id) };
});

/** Apply (or re-apply after a rejection). An admin reviews it in /admin/sellers. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, applySchema);
  return applyToSell(getDb(), user.id, input);
});
