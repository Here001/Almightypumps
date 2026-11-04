import { getDb } from "@/server/db";
import { resetPassword, resetSchema } from "@/server/auth";
import { trustThisDevice } from "@/server/emailCodes";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

/** { challenge, code, password } → new password saved, other devices logged out, signed in here. */
export const POST = route(async (req: Request) => {
  const input = await body(req, resetSchema);
  const db = getDb();
  await rateLimit(db, "emailCodeCheck", clientIp(req));
  const r = await resetPassword(db, input);
  const u = await currentUser();
  if (u) await trustThisDevice(db, u.id);
  return r;
});
