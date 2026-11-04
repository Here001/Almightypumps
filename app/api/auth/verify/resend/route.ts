import { z } from "zod";
import { getDb } from "@/server/db";
import { resendCode } from "@/server/emailCodes";
import { body, route } from "@/server/http";
import { clientIp } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

/** { challenge } → a new code is emailed; returns the new challenge. */
export const POST = route(async (req: Request) => {
  const input = await body(req, z.object({ challenge: z.string().uuid("Please start again.") }));
  return resendCode(getDb(), input.challenge, clientIp(req));
});
