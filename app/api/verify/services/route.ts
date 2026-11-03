import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { listSmsServices } from "@/server/smsVerify";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireUser();
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return listSmsServices(getDb(), q);
});
