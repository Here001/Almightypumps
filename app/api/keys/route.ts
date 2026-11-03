import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { generateApiKey } from "@/core/crypto";
import { getDb } from "@/server/db";
import { apiKeys } from "@/server/db/schema";
import { requireUser } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { body, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return getDb()
    .select({ id: apiKeys.id, prefix: apiKeys.prefix, label: apiKeys.label, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
});

const schema = z.object({ label: z.string().trim().min(1).max(40).default("Default") });

/** Create a reseller API key. The full key is returned once and never stored. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { label } = await body(req, schema);
  const db = getDb();
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
  if (active.length >= 5) throw badRequest("You can have up to 5 active keys. Revoke one first.");
  const k = generateApiKey();
  await db.insert(apiKeys).values({ userId: user.id, keyHash: k.hash, prefix: k.prefix, label });
  return { key: k.key, prefix: k.prefix, label, note: "Copy this key now. It won't be shown again." };
});
