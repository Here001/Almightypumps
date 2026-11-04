/** The public address search engines should use (previews are never indexed). */
export const SITE_URL = "https://almightypumps.com";
export const SITE_NAME = "Almighty Pumps";
export const SITE_TAGLINE = "Boost social media, get US verification numbers and eSIMs, buy gift cards and airtime, all in Naira.";
/** Only the live site is indexed: Vercel previews must stay out of Google. */
export const isIndexable = () => process.env.VERCEL_ENV === "production";
