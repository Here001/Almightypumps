import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myOffers } from "@/server/offers";

export const dynamic = "force-dynamic";

/** Offers I made and offers on my ads. */
export const GET = route(async () => {
  const user = await requireUser();
  return myOffers(getDb(), user.id);
});
