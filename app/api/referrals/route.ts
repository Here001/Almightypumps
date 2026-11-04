import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myReferrals } from "@/server/referrals";

export const dynamic = "force-dynamic";

/** The customer's invite code, link, friends and earnings. */
export const GET = route(async () => {
  const me = await requireUser();
  return myReferrals(getDb(), me.id);
});
