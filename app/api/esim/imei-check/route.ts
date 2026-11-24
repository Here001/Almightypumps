import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { myImeiChecks, requestImeiCheck } from "@/server/imeiChecks";
import { rateLimit } from "@/server/rateLimit";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myImeiChecks(getDb(), user.id);
});

/** Free: ask us to check a phone (IMEI) before ordering. No wallet balance needed. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const db = getDb();
  await assertServiceOn(db, "esim_us");
  await rateLimit(db, "imeiCheck", user.id);
  const { imei } = await body(req, z.object({ imei: z.string().max(40) }));
  return requestImeiCheck(db, user.id, imei);
});
