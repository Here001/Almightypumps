import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { manualOverview, submitManualDeposit, submitSchema } from "@/server/manualPayments";

export const dynamic = "force-dynamic";

/** Where to pay (bank accounts / crypto wallets) + the customer's recent payment notices. */
export const GET = route(async () => {
  const user = await requireUser();
  return manualOverview(getDb(), user.id);
});

/** "I have made payment": { methodId, amount (₦), proof }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(getDb(), "fund", user.id);
  const input = await body(req, submitSchema);
  return submitManualDeposit(getDb(), user, input);
});
