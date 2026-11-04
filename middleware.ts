/**
 * Blocks cross-site request forgery: a browser on another website can't make our API change anything
 * (log in, top up, order, withdraw…) on a signed-in user's behalf. Browsers always send Origin /
 * Sec-Fetch-Site on such requests; when they say "another site", the request is refused.
 * Server-to-server callers (reseller API, payment webhooks, cron) are exempt.
 */
import { NextResponse, type NextRequest } from "next/server";

const EXEMPT = ["/api/v2", "/api/webhooks/", "/api/cron/"];
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(req: NextRequest) {
  if (SAFE.has(req.method) || EXEMPT.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  let crossSite = site === "cross-site";
  if (origin) {
    try { crossSite = crossSite || new URL(origin).host !== host; } catch { crossSite = true; }
  }
  if (crossSite) {
    return NextResponse.json({ ok: false, error: { code: "CROSS_SITE", message: "This request came from another website and was blocked." } }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
