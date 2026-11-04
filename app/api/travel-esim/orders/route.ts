import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myTravelOrders } from "@/server/travelEsim";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myTravelOrders(getDb(), user.id);
});
