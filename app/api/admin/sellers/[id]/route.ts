import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";

const schema = z.object({ decision: z.enum(["verified", "rejected"]) });

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { decision } = await body(req, schema);
  const [u] = await getDb().update(users).set({ sellerStatus: decision }).where(eq(users.id, params.id)).returning({ id: users.id, sellerStatus: users.sellerStatus });
  return u;
});
