import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { isBot, sectionFor } from "@/core/analytics";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { siteEvents } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const COOKIE = "ap_vid";

/** Anonymous page-view beacon for the admin Insights page. Never fails the caller. */
export async function POST(req: Request) {
  try {
    if (isBot(req.headers.get("user-agent"))) return new Response(null, { status: 204 });
    const input = (await req.json().catch(() => ({}))) as { path?: unknown; hash?: unknown };
    const path = typeof input.path === "string" ? input.path.slice(0, 200) : "/";
    const hash = typeof input.hash === "string" ? input.hash.slice(0, 40) : "";
    const section = sectionFor(path, hash);
    if (!section) return new Response(null, { status: 204 });

    const jar = await cookies();
    let visitor = jar.get(COOKIE)?.value;
    if (!visitor || !/^[0-9a-f-]{36}$/.test(visitor)) {
      visitor = randomUUID();
      jar.set(COOKIE, visitor, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    const user = await currentUser().catch(() => null);
    await getDb().insert(siteEvents).values({ visitor, userId: user?.id ?? null, section, path: path + (hash ? hash.slice(0, 40) : "") });
  } catch {
    // Analytics must never break the site.
  }
  return new Response(null, { status: 204 });
}
