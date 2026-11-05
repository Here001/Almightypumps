import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { kycFile } from "@/server/identity";

export const dynamic = "force-dynamic";

/** A customer's ID / selfie / document photo (admins only, never cached by shared caches). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const f = await kycFile(getDb(), id);
    return new Response(new Uint8Array(f.data), { headers: { "content-type": f.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
