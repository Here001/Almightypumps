import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myGiftOrders } from "@/server/giftCards";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myGiftOrders(getDb(), user.id);
});
