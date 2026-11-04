import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { buyTravelEsim, travelDestinations, travelPackagesFor } from "@/server/travelEsim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** No query → destinations (countries + "from" price). ?country=JP → packages for Japan. */
export const GET = route(async (req: Request) => {
  await requireUser();
  const country = new URL(req.url).searchParams.get("country");
  return country ? travelPackagesFor(getDb(), country) : travelDestinations(getDb());
});

/** Buy: { code, priceKobo }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "buy", user.id);
  const input = await body(req, z.object({ code: z.string().min(1).max(80), priceKobo: z.number().int().positive() }));
  return buyTravelEsim(getDb(), user.id, input.code, input.priceKobo);
});
