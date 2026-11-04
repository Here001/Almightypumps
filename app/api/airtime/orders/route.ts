import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myTopups } from "@/server/airtime";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myTopups(getDb(), user.id);
});
