import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { airtimeCatalog, buyTopup } from "@/server/airtime";
import { assertServiceOn } from "@/server/serviceSwitches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Networks with airtime amounts and data plans (Naira prices). */
export const GET = route(async () => {
  await requireUser();
  return airtimeCatalog(getDb());
});

/** Top up: { operatorId, naira (airtime amount) | send (plan), phone, priceKobo }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await assertServiceOn(getDb(), "airtime");
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, z.object({
    operatorId: z.number().int().positive(), naira: z.number().positive().max(1_000_000).optional(), send: z.number().positive().optional(),
    phone: z.string().min(7).max(20), priceKobo: z.number().int().positive(),
  }));
  return buyTopup(getDb(), user.id, input);
});
