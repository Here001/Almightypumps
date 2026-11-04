"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminCounts } from "@/server/adminHome";
import { ADMIN_GROUPS } from "./adminMenu";

function NavList({ path, counts, onPick }: { path: string; counts: AdminCounts; onPick?: () => void }) {
  return (
    <nav aria-label="Admin" className="adm-nav">
      {ADMIN_GROUPS.map((g) => (
        <div key={g.title || "home"} className="adm-group">
          {g.title && <div className="adm-group-title">{g.title}</div>}
          {g.items.map((l) => {
            const n = l.count ? counts[l.count] : 0;
            return (
              <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} onClick={onPick}>
                <span>{l.label}</span>
                {n > 0 && <span className="adm-badge" aria-label={`${n} waiting`}>{n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Admin frame: sidebar on computers; top bar + slide-down menu on phones. Badges refresh on every page change. */
export function AdminShell({ initial, children }: { initial: AdminCounts; children: ReactNode }) {
  const path = usePathname();
  const [counts, setCounts] = useState(initial);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    fetch("/api/admin/counts", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setCounts(j.data); }).catch(() => {});
  }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const current = ADMIN_GROUPS.flatMap((g) => g.items).find((i) => i.href === path)?.label ?? "Admin";

  return (
    <div className="adm">
      <aside className="adm-side glass">
        <Link href="/admin" className="logo" style={{ color: "var(--fg)", fontSize: 15 }}><span className="logo-mark">AP</span>ADMIN</Link>
        <NavList path={path} counts={counts} />
        <Link href="/dashboard" className="adm-back">← My customer dashboard</Link>
      </aside>

      <header className="adm-top glass">
        <Link href="/admin" className="logo" style={{ color: "var(--fg)", fontSize: 14 }}><span className="logo-mark">AP</span></Link>
        <strong className="adm-top-title">{current}</strong>
        <button type="button" className="adm-menu-btn" aria-expanded={open} aria-controls="adm-drawer" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}{!open && total > 0 && <span className="adm-badge">{total}</span>}
        </button>
      </header>
      {open && (
        <div className="adm-drawer-wrap" onClick={() => setOpen(false)}>
          <div id="adm-drawer" className="adm-drawer glass" onClick={(e) => e.stopPropagation()}>
            <NavList path={path} counts={counts} onPick={() => setOpen(false)} />
            <Link href="/dashboard" className="adm-back">← My customer dashboard</Link>
          </div>
        </div>
      )}

      <main className="adm-main">{children}</main>
    </div>
  );
}
