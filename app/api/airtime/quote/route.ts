import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { badRequest } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
import { airtimeQuote } from "@/server/airtime";

export const dynamic = "force-dynamic";

/** ?operatorId=1&naira=500 (airtime) or &send=… (plan) → exact price. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "verifyQuote", user.id);
  const p = new URL(req.url).searchParams;
  const operatorId = Number(p.get("operatorId"));
  if (!Number.isInteger(operatorId)) throw badRequest("Choose a network.");
  const q = await airtimeQuote(getDb(), { operatorId, naira: p.has("naira") ? Number(p.get("naira")) : undefined, send: p.has("send") ? Number(p.get("send")) : undefined });
  return { priceKobo: q.priceKobo, description: q.description };
});
