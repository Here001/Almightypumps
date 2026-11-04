/**
 * Which part of the site a page view belongs to, for the admin Insights page.
 * Returns null for views we don't count (admin pages, API).
 */
const DASHBOARD_ANCHORS: Record<string, string> = {
  services: "Services hub",
  boost: "Social Growth",
  growth: "Social Growth",
  verify: "Verification codes",
  esim: "eSIMs",
  orders: "My orders",
  trades: "P2P Marketplace",
  wallet: "Wallet",
  settings: "Settings",
};

const PREFIXES: [string, string][] = [
  ["/market", "P2P Marketplace"],
  ["/growth", "Social Growth"],
  ["/studio", "Mockup Studio"],
  ["/mockup", "Mockup Studio"],
  ["/documents", "Document Generator"],
  ["/templates", "Website Templates"],
  ["/signup", "Sign up"],
  ["/login", "Log in"],
  ["/privacy", "Privacy & terms"],
  ["/terms", "Privacy & terms"],
];

export function sectionFor(path: string, hash = ""): string | null {
  const p = (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (p.startsWith("/admin") || p.startsWith("/api") || p.startsWith("/_next")) return null;
  if (p === "/") return "Home page";
  if (p === "/dashboard") {
    const h = hash.replace(/^#/, "");
    if (h.startsWith("shop-")) return "Shop";
    return DASHBOARD_ANCHORS[h] ?? "Dashboard";
  }
  for (const [prefix, name] of PREFIXES) {
    if (p === prefix || p.startsWith(prefix + "/")) return name;
  }
  return "Other";
}

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i.test(userAgent);
}
