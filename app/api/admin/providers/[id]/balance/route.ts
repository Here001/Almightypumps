import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { providerBalance } from "@/server/smm";

export const dynamic = "force-dynamic";

/** Our current balance on the provider's panel. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  return providerBalance(getDb(), id);
});
