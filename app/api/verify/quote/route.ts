import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { badRequest } from "@/server/errors";
import { quoteSmsService } from "@/server/smsVerify";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireUser();
  const name = new URL(req.url).searchParams.get("service");
  if (!name) throw badRequest("Choose a service.");
  const q = await quoteSmsService(getDb(), name);
  return { name: q.name, label: q.label, priceKobo: q.priceKobo };
});
