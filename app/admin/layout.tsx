import type { Metadata } from "next";
import Link from "next/link";
import { adminOrRedirect } from "@/server/adminPage";
import { AdminNav } from "@/components/AdminNav";

export const metadata: Metadata = { title: "Admin · Almighty Pumps", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await adminOrRedirect();
  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <div className="dash">
        <aside className="dash-side glass">
          <Link href="/" className="logo" style={{ color: "var(--fg)", fontSize: 15 }}><span className="logo-mark">AP</span>ADMIN</Link>
          <AdminNav />
          <div style={{ marginTop: "auto" }}><Link href="/dashboard" className="muted" style={{ fontSize: 14 }}>← Back to my dashboard</Link></div>
        </aside>
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}
