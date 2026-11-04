import { z } from "zod";
import { getDb } from "@/server/db";
import { register, registerSchema, startSession } from "@/server/auth";
import { verifyCaptcha } from "@/server/captcha";
import { body, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const schema = registerSchema.extend({ captcha: z.string().max(4000).optional() });

export const POST = route(async (req: Request) => {
  const input = await body(req, schema);
  const db = getDb();
  const ip = clientIp(req);
  await rateLimit(db, "registerIp", ip);
  await verifyCaptcha(input.captcha, ip);
  const user = await register(db, input);
  await startSession(user.id, true);
  return user;
});
