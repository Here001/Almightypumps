import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { payments } from "@/server/db/schema";
import { requireUser } from "@/server/auth";
import { forbidden, notFound } from "@/server/errors";
import { body, route } from "@/server/http";
import { confirmFunding } from "@/server/payments";

const schema = z.object({ reference: z.string().regex(/^AP-FUND-/) });

/** Called when Paystack redirects back, in case the webhook is slow. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { reference } = await body(req, schema);
  const db = getDb();
  const [p] = await db.select({ userId: payments.userId }).from(payments).where(eq(payments.reference, reference));
  if (!p) throw notFound("Payment");
  if (p.userId !== user.id) throw forbidden();
  return confirmFunding(db, reference);
});
