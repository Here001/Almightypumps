import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { handlePaystackWebhook } from "@/server/payments";

export const dynamic = "force-dynamic";

/** Set this URL in Paystack: {APP_URL}/api/webhooks/paystack */
export const POST = route(async (req: Request) => {
  const raw = await req.text();
  return handlePaystackWebhook(getDb(), raw, req.headers.get("x-paystack-signature"));
});
