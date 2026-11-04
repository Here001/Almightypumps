import type { MetadataRoute } from "next";
import { SITE_URL, isIndexable } from "@/core/site";

/** Live site: public pages open to search engines and AI assistants; private areas closed. Previews: nothing indexed. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const privateAreas = ["/admin", "/dashboard", "/api/", "/forgot-password"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privateAreas },
      // AI assistants and answer engines: welcome on public pages (so we can be recommended).
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot"], allow: "/", disallow: privateAreas },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
