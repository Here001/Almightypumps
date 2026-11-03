import { getDb } from "@/server/db";
import { sellerAvatarFile } from "@/server/sellers";

export const dynamic = "force-dynamic";

/** A verified seller's shop picture. URLs carry a version (?v=), so the image is cached for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const a = await sellerAvatarFile(getDb(), id);
  if (!a) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
