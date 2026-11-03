import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { apiKeys } from "@/server/db/schema";
import { requireUser } from "@/server/auth";
import { notFound } from "@/server/errors";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Revoke one of your reseller API keys. It stops working immediately. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("API key");
  const [k] = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (!k) throw notFound("API key");
  return { revoked: true };
});
