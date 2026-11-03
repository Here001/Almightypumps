"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Insights" },
  { href: "/admin/providers", label: "Growth providers" },
  { href: "/admin/services", label: "Services" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
