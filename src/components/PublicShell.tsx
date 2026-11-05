import Link from "next/link";
import type { ReactNode } from "react";
import { SEO_PAGES } from "@/content/seoPages";

/** Header + footer for public, indexable pages (service pages). */
export function PublicShell({ children }: { children: ReactNode }) {
  const cats = [...new Set(SEO_PAGES.map((p) => p.category))];
  return (
    <div className="app-shell pub">
      <div className="app-bg" aria-hidden="true" />
      <header className="pub-top">
        <Link href="/" className="logo" style={{ color: "var(--fg)" }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
        <nav aria-label="Account" className="pub-top-nav">
          <Link href="/services">Services</Link>
          <Link href="/login">Log in</Link>
          <Link href="/signup" className="btn btn-primary ap-mini">Sign up free</Link>
        </nav>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot">
        <div className="pub-foot-grid">
          {cats.map((c) => (
            <nav key={c} aria-label={c}>
              <strong>{c}</strong>
              {SEO_PAGES.filter((p) => p.category === c).map((p) => <Link key={p.slug} href={`/services/${p.slug}`}>{p.h1.replace(/,.*$/, "")}</Link>)}
            </nav>
          ))}
          <nav aria-label="Company">
            <strong>Company</strong>
            <Link href="/track">Track a package</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="mailto:support@almightypumps.com">support@almightypumps.com</a>
          </nav>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>© {new Date().getFullYear()} Almighty Pumps · Lagos, Nigeria</p>
      </footer>
    </div>
  );
}
