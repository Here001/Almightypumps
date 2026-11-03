import { getDb } from "@/server/db";
import { requireCron, route } from "@/server/http";
import { runEscrowTimers } from "@/server/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  requireCron(req);
  return runEscrowTimers(getDb());
});
