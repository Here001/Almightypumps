import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { nameChangeFile } from "@/server/nameChanges";

export const dynamic = "force-dynamic";

/** A document a customer sent with a name change (admins only, never cached by shared caches). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const f = await nameChangeFile(getDb(), id);
    return new Response(new Uint8Array(f.data), { headers: { "content-type": f.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
