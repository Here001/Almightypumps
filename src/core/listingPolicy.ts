/**
 * Marketplace listing rules. Escrow attracts fraud, so some items are never allowed
 * (BLOCKED). Borderline ones (gift cards, crypto, ambiguous wording) go to an admin
 * review queue instead of being rejected (REVIEW). Admins can remove anything missed.
 */

export const CATEGORIES = [
  "fashion",
  "phones-gadgets",
  "beauty",
  "home",
  "digital-products",
  "gift-cards-crypto",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DELIVERY_TYPES = ["physical", "digital", "service"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

// Patterns are matched against title + description, case-insensitive.
// BLOCKED: refused outright (fraud, illegal goods, account sales). Not adjustable.
const BLOCKED: { reason: string; pattern: RegExp }[] = [
  { reason: "Social media, gaming or email accounts can't be sold.", pattern: /\b(instagram|ig|tiktok|facebook|fb|twitter|snapchat|youtube|telegram|gmail|outlook|pubg|codm|cod ?mobile|free ?fire|fortnite|steam|roblox)\s+(account|acct|page|handle|channel)s?\b/i },
  { reason: "Social media, gaming or email accounts can't be sold.", pattern: /\b(aged|verified|old|pva)\s+(account|acct)s?\b/i },
  { reason: "Identity documents and templates can't be sold.", pattern: /\b(passport|driver'?s? licen[cs]e|national id|nin slip|voter'?s? card|bvn|id card template|fake id)\b/i },
  { reason: "Financial documents can't be sold.", pattern: /\b(bank statement|utility bill|pay ?slip|proof of (funds|address))\b/i },
  { reason: "Counterfeit goods can't be sold.", pattern: /\b(replica|counterfeit|first copy|class a copy|1:1 copy|mirror quality)\b/i },
  { reason: "Weapons and drugs can't be sold.", pattern: /\b(gun|pistol|rifle|ammo|ammunition|cocaine|heroin|tramadol|codeine|weed|cannabis|colorado)\b/i },
  { reason: "Card details, logs and hacking tools can't be sold.", pattern: /\b(cc ?dumps?|cvv|fullz|bank logs?|carding|spam tools?|phishing|otp bypass)\b/i },
];

// REVIEW: allowed, but an admin approves the listing before it goes live.
const REVIEW: { reason: string; pattern: RegExp }[] = [
  { reason: "Gift card and crypto listings are checked by our team before going live.", pattern: /\b(gift ?cards?|itunes card|steam card|usdt|bitcoin|btc|crypto|ethereum|eth)\b/i },
  // "fake" on its own is ambiguous; "no fakes", "not fake" etc. are fine and skip review.
  { reason: "Listings mentioning “fake” are checked by our team before going live.", pattern: /(?<!\b(?:no|not|never|zero|non|anti)[\s-]{1,3})\bfakes?\b/i },
];

/** Reasons a piece of text is refused outright (also used for admin shop products). */
export function blockedReasons(text: string): string[] {
  const out = new Set<string>();
  for (const b of BLOCKED) if (b.pattern.test(text)) out.add(b.reason);
  return [...out];
}

export function reviewReasons(text: string): string[] {
  const out = new Set<string>();
  for (const r of REVIEW) if (r.pattern.test(text)) out.add(r.reason);
  return [...out];
}

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

/** `categories` = slugs admins have set up (default: the starter list); category-level review is applied by the server. */
export function checkListing(l: ListingInput, categories: readonly string[] = CATEGORIES): { ok: boolean; problems: string[]; review: string[] } {
  const problems: string[] = [];
  const title = l.title.trim();
  const description = l.description.trim();
  if (title.length < 4 || title.length > 120) problems.push("Title must be between 4 and 120 characters.");
  if (description.length < 20 || description.length > 4000) problems.push("Description must be between 20 and 4,000 characters.");
  if (!categories.includes(l.category)) problems.push("Choose a valid category.");
  if (!(DELIVERY_TYPES as readonly string[]).includes(l.deliveryType)) problems.push("Choose how the item is delivered.");
  if (!Number.isSafeInteger(l.priceKobo) || l.priceKobo < 10_000) problems.push("Price must be at least ₦100.");
  if (!Number.isInteger(l.stock) || l.stock < 0) problems.push("Stock must be zero or more.");
  if (!Number.isInteger(l.minQty) || l.minQty < 1) problems.push("Minimum per order must be at least 1.");
  if (!Number.isInteger(l.maxQty) || l.maxQty < l.minQty) problems.push("Maximum per order must be at least the minimum.");

  const text = `${title}\n${description}`;
  problems.push(...blockedReasons(text));
  const review = problems.length ? [] : reviewReasons(text);
  if (l.category === "gift-cards-crypto" && !review.length && !problems.length) review.push("Gift card and crypto listings are checked by our team before going live.");
  return { ok: problems.length === 0, problems, review };
}
