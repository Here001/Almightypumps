/**
 * Turns a provider's raw catalogue (category + service name) into something a
 * customer can browse: a platform ("Instagram"), a kind ("Followers"), a cleaner
 * display name, and a policy check for services we refuse to sell.
 */

const PLATFORM_ALIASES: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook",
  twitter: "X (Twitter)", "x (twitter)": "X (Twitter)", x: "X (Twitter)", telegram: "Telegram",
  whatsapp: "WhatsApp", spotify: "Spotify", audiomack: "Audiomack", boomplay: "Boomplay",
  snapchat: "Snapchat", threads: "Threads", linkedin: "LinkedIn", twitch: "Twitch", kick: "Kick",
  soundcloud: "SoundCloud", "apple music": "Apple Music", apple_music: "Apple Music",
  reddit: "Reddit", discord: "Discord", pinterest: "Pinterest", quora: "Quora", rumble: "Rumble",
  deezer: "Deezer", tidal: "Tidal", podcast: "Podcasts", podcasts: "Podcasts", bluesky: "Bluesky",
  kwai: "Kwai", rubika: "Rubika", shopee: "Shopee", jiji: "Jiji",
  website: "Website & SEO", "website & seo": "Website & SEO", google: "Website & SEO",
  creative: "Business services", biz: "Business services", "more services": "More services",
};

/** Shown first, in this order; everything else follows by size. */
export const POPULAR_PLATFORMS = [
  "Instagram", "TikTok", "YouTube", "Facebook", "X (Twitter)", "Telegram", "WhatsApp", "Spotify",
  "Audiomack", "Boomplay", "Snapchat", "Threads",
];

export function platformFor(category: string): string {
  const key = category.trim().toLowerCase().replace(/\s+/g, " ");
  if (PLATFORM_ALIASES[key]) return PLATFORM_ALIASES[key];
  const spaced = key.replace(/_/g, " ");
  if (PLATFORM_ALIASES[spaced]) return PLATFORM_ALIASES[spaced];
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || "More services";
}

const KINDS: [string, RegExp][] = [
  ["Live viewers", /live\s*stream|livestream|\blive\b/i],
  ["Likes", /comment\s*likes?/i],
  ["Comments", /comment/i],
  ["Followers", /follower|subscriber|\bsubs\b|members?\b|\bfans?\b|friends|connections/i],
  ["Likes", /\blikes?\b|reaction|hearts?\b|upvote|favou?rites?/i],
  ["Shares", /share|repost|retweet|forward/i],
  ["Saves", /\bsaves?\b|bookmark/i],
  ["Plays", /\bplays?\b|stream|listen|download/i],
  ["Views", /view|impression|reach|watch/i],
  ["Traffic", /traffic|visit|click/i],
];

export function kindFor(name: string): string {
  for (const [kind, re] of KINDS) if (re.test(name)) return kind;
  return "Other";
}

/**
 * Services we don't sell even if a provider offers them: fake reviews and
 * ratings, rigged votes/polls and fake shop activity. These deceive other
 * shoppers and voters (consumer-protection risk), unlike reach/engagement boosts.
 */
const RESTRICTED = /\breviews?\b|\bratings?\b|star rating|trustpilot|\bvotes?\b|\bvoting\b|\bpolls?\b|add[- ]to[- ]cart/i;
const RESTRICTED_CATEGORIES = /^(voting|bbnaija|trustpilot|amazon|aliexpress|app_store|webstore|marketplace|bolt_food|glovo|chowdeck)$/i;

export function isRestricted(name: string, category: string): boolean {
  return RESTRICTED.test(name) || RESTRICTED_CATEGORIES.test(category.trim());
}

/** Drop provider server codes ("S19 ") and leading emoji/stars so names read cleanly. */
export function displayName(name: string): string {
  let out = name.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2605}\u{2606}\u{2B50}\s|~-]+/u, "").replace(/^S\d+\s+/i, "").trim();
    if (next === out) break;
    out = next;
  }
  return out || name;
}
