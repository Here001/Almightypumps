import { getDb } from "@/server/db";
import { requireCron, route } from "@/server/http";
import { syncOrders } from "@/server/smm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  requireCron(req);
  return syncOrders(getDb());
});
