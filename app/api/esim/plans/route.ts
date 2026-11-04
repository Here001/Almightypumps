import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { plansForSale } from "@/server/esim";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireUser();
  return plansForSale(getDb());
});
