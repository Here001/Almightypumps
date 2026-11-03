import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { handleFlutterwaveWebhook } from "@/server/payments";

export const dynamic = "force-dynamic";

/** Set this URL in Flutterwave > Settings > Webhooks: {APP_URL}/api/webhooks/flutterwave */
export const POST = route(async (req: Request) => {
  const raw = await req.text();
  return handleFlutterwaveWebhook(getDb(), raw, {
    verifHash: req.headers.get("verif-hash"),
    signature: req.headers.get("flutterwave-signature"),
  });
});
