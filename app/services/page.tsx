import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { SEO_PAGES } from "@/content/seoPages";
import { SITE_NAME, SITE_URL } from "@/core/site";

const TITLE = "All Services: Social Growth, US Numbers, eSIMs, Gift Cards";
const DESC = "Everything on Almighty Pumps: Instagram, TikTok and YouTube growth, US verification numbers, US and travel eSIMs, gift cards, airtime and data, all paid in Naira.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · ${SITE_NAME}` },
  description: DESC,
  alternates: { canonical: "/services" },
  openGraph: { title: TITLE, description: DESC, url: "/services", type: "website", siteName: SITE_NAME, locale: "en_NG" },
};

export default function ServicesIndex() {
  const cats = [...new Set(SEO_PAGES.map((p) => p.category))];
  const jsonLd = {
    "@context": "https://schema.org", "@type": "ItemList", name: TITLE,
    itemListElement: SEO_PAGES.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/services/${p.slug}`, name: p.title })),
  };
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="pub-hero glass">
        <span className="pub-kicker">Services</span>
        <h1>Everything you can do with one Naira wallet</h1>
        <p className="pub-lead">Grow your social media, get US numbers and eSIMs, buy gift cards, airtime and data, sell gift cards, and trade safely with escrow. Free to join; pay only for what you order.</p>
        <div className="pub-cta"><Link href="/signup" className="btn btn-primary">Create a free account</Link></div>
      </section>
      {cats.map((c) => (
        <section key={c} className="card glass">
          <h2>{c}</h2>
          <ul className="pub-related">
            {SEO_PAGES.filter((p) => p.category === c).map((p) => (
              <li key={p.slug}><Link href={`/services/${p.slug}`}><strong>{p.h1}</strong><span className="muted">{p.description}</span></Link></li>
            ))}
          </ul>
        </section>
      ))}
    </PublicShell>
  );
}
