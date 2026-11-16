"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Admin pages: every top-level card (<section>) becomes a tab, so the page shows one thing at a time and nothing has to
 * be found by scrolling. The main job of the page opens first (PREFER), a card that appears after you click something
 * (an editor, a form) opens straight away, and the open tab is kept in the address (#t=…) so Back/refresh keep it.
 * Pages with fewer than two cards are left as they are. Works on the page's own markup, so no page needs rewriting.
 */
const PREFER: Record<string, string[]> = {
  "/admin/payments": ["To confirm", "History"],
  "/admin/sell": ["To check"],
  "/admin/shipping": ["Packages"],
  "/admin/switches": ["Switch services"],
  "/admin/providers": ["Connections"],
  "/admin/whatsapp": ["Overview", "Recent messages"],
  "/admin/money": ["Overview"],
  "/admin/services": ["Overview"],
};
// Admin Home is a short list of shortcuts; these pages already have their own tabs or read best as one page.
const SKIP = new Set(["/admin", "/admin/instant", "/admin/insights", "/admin/p2p-categories"]);

type Tab = { key: string; label: string };
const slug = (s: string) => s.toLowerCase().replace(/\(\d+\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tab";
const labelOf = (el: Element) => {
  const h = el.querySelector("h2, h3");
  return (el.getAttribute("aria-label") || h?.textContent || "Overview").trim().replace(/\s+/g, " ").slice(0, 40);
};

export function useAdminTabs(mainRef: RefObject<HTMLElement | null>, path: string) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const known = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;

  // Read the page's cards, build the tab list, and show only the open one.
  useEffect(() => {
    const main = mainRef.current;
    known.current = new Set(); ready.current = false;
    setTabs([]); setActive(null);
    if (!main || SKIP.has(path)) return;
    const fromHash = () => new URLSearchParams(location.hash.slice(1)).get("t");

    const scan = () => {
      const cards = Array.from(main.querySelectorAll(":scope > section"));
      if (cards.length < 2) { cards.forEach((c) => { (c as HTMLElement).hidden = false; }); setTabs((p) => (p.length ? [] : p)); return; }
      const seen = new Map<string, number>();
      const list: (Tab & { el: HTMLElement })[] = cards.map((c) => {
        const label = labelOf(c);
        let key = slug(label);
        const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
        if (n > 1) key = `${key}-${n}`;
        (c as HTMLElement).dataset.tab = key;
        return { key, label, el: c as HTMLElement };
      });
      const prefer = PREFER[path] ?? [];
      const rank = (t: Tab) => { const i = prefer.findIndex((p) => t.label.startsWith(p)); return i === -1 ? prefer.length : i; };
      const ordered = [...list].sort((a, b) => rank(a) - rank(b));
      // A card that wasn't there before (you opened an editor or form) opens straight away.
      const fresh = ready.current ? list.find((t) => !known.current.has(t.key)) : undefined;
      list.forEach((t) => known.current.add(t.key));
      let open = fresh?.key ?? activeRef.current ?? fromHash();
      if (!open || !list.some((t) => t.key === open)) open = ordered[0].key;
      list.forEach((t) => { t.el.hidden = t.key !== open; });
      const next = ordered.map(({ key, label }) => ({ key, label }));
      setTabs((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      if (open !== activeRef.current) setActive(open);
      ready.current = true;
    };
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(main, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); main.querySelectorAll(":scope > section").forEach((c) => { (c as HTMLElement).hidden = false; }); };
  }, [mainRef, path]);

  const choose = (key: string) => {
    const main = mainRef.current;
    if (!main) return;
    main.querySelectorAll(":scope > section").forEach((c) => { (c as HTMLElement).hidden = (c as HTMLElement).dataset.tab !== key; });
    setActive(key);
    history.replaceState(null, "", `#t=${key}`);
    window.scrollTo({ top: 0 });
  };
  return { tabs, active, choose };
}

/** When you click something that opens a form, editor or panel below the fold, bring it into view. */
export function useRevealOnClick(mainRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let armedUntil = 0;
    const arm = (e: Event) => { if ((e.target as Element)?.closest("button, a, [role=button], summary")) armedUntil = Date.now() + 1200; };
    const mo = new MutationObserver((records) => {
      if (Date.now() > armedUntil) return;
      for (const r of records) {
        for (const n of Array.from(r.addedNodes)) {
          if (!(n instanceof HTMLElement)) continue;
          const target = n.matches("section, form, textarea, .ap-subform, [role=dialog], [data-reveal]") ? n : n.querySelector<HTMLElement>("form, textarea, .ap-subform, [data-reveal]");
          if (!target || target.closest("[hidden]")) continue;
          const box = target.getBoundingClientRect();
          if (box.top < 70 || box.top > window.innerHeight - 80) {
            armedUntil = 0;
            requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
            return;
          }
        }
      }
    });
    main.addEventListener("click", arm, true);
    mo.observe(main, { childList: true, subtree: true });
    return () => { main.removeEventListener("click", arm, true); mo.disconnect(); };
  }, [mainRef]);
}

export function AdminTabBar({ tabs, active, choose }: { tabs: Tab[]; active: string | null; choose: (k: string) => void }) {
  if (tabs.length < 2) return null;
  return (
    <div className="adm-tabs" role="tablist" aria-label="Sections of this page">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === active} className="adm-tab" onClick={() => choose(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}
