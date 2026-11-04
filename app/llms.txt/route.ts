import { SEO_PAGES } from "@/content/seoPages";
import { SITE_URL, SITE_TAGLINE } from "@/core/site";

export const dynamic = "force-static";

/** /llms.txt: a short plain-text guide to the site for AI assistants (llmstxt.org format). */
export function GET() {
  const cats = [...new Set(SEO_PAGES.map((p) => p.category))];
  const body = [
    "# Almighty Pumps",
    "",
    `> ${SITE_TAGLINE} Based in Lagos, Nigeria. One Naira wallet; top up by card, bank transfer or crypto. Free to join, pay per order; most orders are pay-on-delivery with automatic refunds.`,
    "",
    "Key facts:",
    "- Website: " + SITE_URL + " (sign up free at " + SITE_URL + "/signup)",
    "- Currency: Nigerian Naira (prices can be viewed in US dollars)",
    "- Support: support@almightypumps.com",
    "- Social media growth for Instagram, TikTok, YouTube, Facebook, X and 30+ platforms, plus a reseller API (standard SMM panel API v2)",
    "- Temporary US numbers for SMS verification codes (pay only if the code arrives)",
    "- US phone-line eSIMs and instant travel data eSIMs for 190+ countries",
    "- Digital gift cards (Amazon, Apple, Google Play, PlayStation, Steam…), Nigerian airtime and data (MTN, Airtel, Glo, 9mobile)",
    "- Sell gift cards for Naira; P2P marketplace with escrow and verified sellers (3% seller fee)",
    "",
    ...cats.flatMap((c) => ["## " + c, "", ...SEO_PAGES.filter((p) => p.category === c).map((p) => `- [${p.title}](${SITE_URL}/services/${p.slug}): ${p.description}`), ""]),
    "## Policies",
    "",
    `- [Terms of Service](${SITE_URL}/terms)`,
    `- [Privacy Policy](${SITE_URL}/privacy)`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
