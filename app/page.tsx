import type { Metadata } from "next";
import { LANDING_HTML } from "@/landing/markup";
import LandingEffects from "@/components/LandingEffects";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/core/site";
import { SEO_PAGES } from "@/content/seoPages";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** What search engines and AI assistants read about the business (no ratings or reviews: we don't invent those). */
const JSON_LD = [
  {
    "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL,
    logo: `${SITE_URL}/apple-icon`, description: SITE_TAGLINE, email: "support@almightypumps.com",
    address: { "@type": "PostalAddress", addressLocality: "Lagos", addressCountry: "NG" }, areaServed: "NG",
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: "support@almightypumps.com", availableLanguage: ["English"] },
  },
  { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#site`, name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` }, inLanguage: "en-NG" },
  {
    "@context": "https://schema.org", "@type": "OfferCatalog", name: `${SITE_NAME} services`, url: `${SITE_URL}/services`,
    itemListElement: SEO_PAGES.map((p) => ({ "@type": "Offer", priceCurrency: "NGN", url: `${SITE_URL}/services/${p.slug}`, itemOffered: { "@type": "Service", name: p.h1, description: p.description } })),
  },
];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <div dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
      <LandingEffects />
    </>
  );
}
