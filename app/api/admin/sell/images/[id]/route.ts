import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { notFound } from "@/server/errors";
import { tradeInImage } from "@/server/sellDesk";

export const dynamic = "force-dynamic";

/** A customer's gift card photo (admins only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Picture");
    const img = await tradeInImage(getDb(), id);
    return new Response(new Uint8Array(img.data), { headers: { "content-type": img.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
