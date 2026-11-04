import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { SEO_PAGES, seoPage } from "@/content/seoPages";
import { SITE_NAME, SITE_URL } from "@/core/site";

export const dynamicParams = false;
export function generateStaticParams() {
  return SEO_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = seoPage((await params).slug);
  if (!p) return {};
  const url = `/services/${p.slug}`;
  return {
    title: { absolute: `${p.title} · ${SITE_NAME}` },
    description: p.description,
    alternates: { canonical: url },
    openGraph: { title: p.title, description: p.description, url, type: "website", siteName: SITE_NAME, locale: "en_NG" },
    twitter: { card: "summary_large_image", title: p.title, description: p.description },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = seoPage((await params).slug);
  if (!p) notFound();
  const url = `${SITE_URL}/services/${p.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "Service", name: p.h1, description: p.description, serviceType: p.category, url,
      areaServed: { "@type": "Country", name: "Nigeria" }, provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      offers: { "@type": "Offer", priceCurrency: "NGN", availability: "https://schema.org/InStock", url },
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Services", item: `${SITE_URL}/services` },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
      ],
    },
  ];
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="pub-crumb"><Link href="/">Home</Link> / <Link href="/services">Services</Link> / <span>{p.category}</span></nav>
      <section className="pub-hero glass">
        <span className="pub-kicker">{p.category}</span>
        <h1>{p.h1}</h1>
        {p.intro.map((t, i) => <p key={i} className="pub-lead">{t}</p>)}
        <div className="pub-cta">
          <Link href="/signup" className="btn btn-primary">{p.cta}</Link>
          <Link href={`/dashboard#${p.section}`} className="btn btn-ghost">I have an account</Link>
        </div>
      </section>
      <div className="pub-grid">
        <section className="card glass">
          <h2>How it works</h2>
          <ol className="pub-steps">{p.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
        <section className="card glass">
          <h2>Why Almighty Pumps</h2>
          <ul className="pub-points">{p.points.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      </div>
      <section className="card glass">
        <h2>Questions</h2>
        <div className="pub-faq">
          {p.faqs.map((f, i) => <details key={i} open={i === 0}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div>
      </section>
      <section className="card glass">
        <h2>Related services</h2>
        <ul className="pub-related">
          {p.related.map((s) => seoPage(s)).filter(Boolean).map((r) => (
            <li key={r!.slug}><Link href={`/services/${r!.slug}`}><strong>{r!.h1}</strong><span className="muted">{r!.description}</span></Link></li>
          ))}
        </ul>
      </section>
    </PublicShell>
  );
}
