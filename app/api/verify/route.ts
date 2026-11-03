import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { myVerifications, startVerification } from "@/server/smsVerify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The customer's recent verification codes. */
export const GET = route(async () => {
  const user = await requireUser();
  return myVerifications(getDb(), user.id);
});

/** Rent a number: { service, priceKobo } (the price the customer agreed to). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, z.object({ service: z.string().min(1).max(100), priceKobo: z.number().int().positive() }));
  return startVerification(getDb(), user.id, input.service, input.priceKobo);
});
