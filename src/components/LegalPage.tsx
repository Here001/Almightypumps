import Link from "next/link";
import type { ReactNode } from "react";

/** Shared layout for the Privacy Policy and Terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="app-shell legal-wrap">
      <div className="app-bg" aria-hidden="true" />
      <article className="legal-doc glass">
        <Link href="/" className="logo" style={{ color: "var(--fg)" }}>
          <span className="logo-mark">AP</span>ALMIGHTY PUMPS
        </Link>
        <h1>{title}</h1>
        <p className="muted">Last updated: {updated}</p>
        {children}
        <nav className="legal-nav" aria-label="Legal">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <a href="mailto:support@almightypumps.com">support@almightypumps.com</a>
          <Link href="/">Home</Link>
        </nav>
      </article>
    </main>
  );
}
