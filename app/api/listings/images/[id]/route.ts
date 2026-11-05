import { getDb } from "@/server/db";
import { listingImageFile } from "@/server/listingImages";

export const dynamic = "force-dynamic";

/** One photo of a P2P ad. Ids never change content, so it's cached for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const f = await listingImageFile(getDb(), id);
  if (!f) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Photos moved to file storage: send the browser there.
  if (f.url || !f.data) return f.url ? Response.redirect(f.url, 308) : new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
