import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { reportsForAdmin } from "@/server/sellerReports";

export const dynamic = "force-dynamic";

/** ?status=open|closed */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  return reportsForAdmin(getDb(), new URL(req.url).searchParams.get("status") === "closed" ? "closed" : "open");
});
