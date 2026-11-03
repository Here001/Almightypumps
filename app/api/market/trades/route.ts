import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myTrades } from "@/server/market";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myTrades(getDb(), user.id);
});
