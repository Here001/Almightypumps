import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { providerBalance, syncServices } from "@/server/smm";

export const maxDuration = 60;

/** Re-import a provider's services and prices, and report our balance there. */
export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const db = getDb();
  const services = await syncServices(db, params.id);
  const balance = await providerBalance(db, params.id);
  return { ...services, providerBalance: balance };
});
