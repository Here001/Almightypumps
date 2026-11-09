import { after } from "next/server";
import { getDb } from "@/server/db";
import { handleWhatsAppWebhook, validSignature, verifyToken } from "@/server/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta's one-time check when the webhook is saved (Callback URL + Verify token from Admin → WhatsApp agent). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === verifyToken()) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Incoming WhatsApp messages. Answer 200 straight away (Meta retries slow webhooks) and reply in the background. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  after(() => handleWhatsAppWebhook(getDb(), body).catch((e) => console.error("[whatsapp] webhook", e)));
  return new Response("OK", { status: 200 });
}
