import { z } from "zod";
import { getDb } from "@/server/db";
import { startSession } from "@/server/auth";
import { checkCode, trustThisDevice } from "@/server/emailCodes";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

/** { challenge, code } → signed in; this device is trusted for 30 days. */
export const POST = route(async (req: Request) => {
  const input = await body(req, z.object({ challenge: z.string().uuid("Please start again."), code: z.string().max(20) }));
  const db = getDb();
  await rateLimit(db, "emailCodeCheck", clientIp(req));
  const r = await checkCode(db, input.challenge, input.code);
  await startSession(r.userId, r.remember);
  await trustThisDevice(db, r.userId);
  return { ok: true, purpose: r.purpose };
});
