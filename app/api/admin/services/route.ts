import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { adminServices, type ServiceStatus } from "@/server/smm";

export const dynamic = "force-dynamic";

const STATUSES: ServiceStatus[] = ["on_sale", "admin", "policy", "provider"];

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const status = STATUSES.find((s) => s === p.get("status"));
  return adminServices(getDb(), {
    status,
    platform: p.get("platform")?.slice(0, 100) || undefined,
    q: p.get("q")?.slice(0, 100) || undefined,
    offset: Number(p.get("offset") ?? 0) || 0,
  });
});
