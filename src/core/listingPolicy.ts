/**
 * Marketplace listing rules. Escrow attracts fraud, so some items are never
 * allowed. Admins can still remove anything this filter misses.
 */

export const CATEGORIES = [
  "fashion",
  "phones-gadgets",
  "beauty",
  "home",
  "digital-products",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DELIVERY_TYPES = ["physical", "digital", "service"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

// Patterns are matched against title + description, case-insensitive.
const BANNED: { reason: string; pattern: RegExp }[] = [
  { reason: "Social media, gaming or email accounts can't be sold.", pattern: /\b(instagram|tiktok|facebook|twitter|x|snapchat|youtube|telegram|gmail|pubg|codm|free ?fire)\s+(account|acct|page|handle|channel)s?\b/i },
  { reason: "Social media, gaming or email accounts can't be sold.", pattern: /\b(aged|verified|old|pva)\s+(account|acct)s?\b/i },
  { reason: "Identity documents and templates can't be sold.", pattern: /\b(passport|driver'?s? licen[cs]e|national id|nin slip|voter'?s? card|bvn|id card template|fake id)\b/i },
  { reason: "Financial documents can't be sold.", pattern: /\b(bank statement|utility bill|pay ?slip|proof of (funds|address))\b/i },
  { reason: "Counterfeit goods can't be sold.", pattern: /\b(replica|counterfeit|fake|first copy|class a copy|1:1 copy)\b/i },
  { reason: "Weapons and drugs can't be sold.", pattern: /\b(gun|pistol|rifle|ammo|ammunition|cocaine|heroin|tramadol|codeine|weed|cannabis|colorado)\b/i },
  { reason: "Card details, logs and hacking tools can't be sold.", pattern: /\b(cc ?dumps?|cvv|fullz|bank logs?|carding|spam tools?|phishing|otp bypass)\b/i },
  { reason: "Gift card and crypto trading isn't supported on the marketplace.", pattern: /\b(gift ?cards?|usdt|bitcoin|btc)\b/i },
];

export type ListingInput = {
  title: string;
  description: string;
  category: string;
  deliveryType: string;
  priceKobo: number;
  stock: number;
  minQty: number;
  maxQty: number;
};

export function checkListing(l: ListingInput): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const title = l.title.trim();
  const description = l.description.trim();
  if (title.length < 4 || title.length > 120) problems.push("Title must be between 4 and 120 characters.");
  if (description.length < 20 || description.length > 4000) problems.push("Description must be between 20 and 4,000 characters.");
  if (!(CATEGORIES as readonly string[]).includes(l.category)) problems.push("Choose a valid category.");
  if (!(DELIVERY_TYPES as readonly string[]).includes(l.deliveryType)) problems.push("Choose how the item is delivered.");
  if (!Number.isSafeInteger(l.priceKobo) || l.priceKobo < 10_000) problems.push("Price must be at least ₦100.");
  if (!Number.isInteger(l.stock) || l.stock < 0) problems.push("Stock must be zero or more.");
  if (!Number.isInteger(l.minQty) || l.minQty < 1) problems.push("Minimum per order must be at least 1.");
  if (!Number.isInteger(l.maxQty) || l.maxQty < l.minQty) problems.push("Maximum per order must be at least the minimum.");

  const text = `${title}\n${description}`;
  const seen = new Set<string>();
  for (const b of BANNED) {
    if (b.pattern.test(text) && !seen.has(b.reason)) {
      seen.add(b.reason);
      problems.push(b.reason);
    }
  }
  return { ok: problems.length === 0, problems };
}
