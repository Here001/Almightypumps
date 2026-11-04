import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { adminOrRedirect } from "@/server/adminPage";
import { adminCounts } from "@/server/adminHome";
import { AdminShell } from "@/components/AdminNav";

export const metadata: Metadata = { title: "Admin · Almighty Pumps", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await adminOrRedirect();
  const counts = await adminCounts(getDb());
  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <AdminShell initial={counts}>{children}</AdminShell>
    </div>
  );
}
