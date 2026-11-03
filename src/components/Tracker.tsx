"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends one anonymous view per page and per dashboard section (#growth, #trades, #wallet). */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const send = () => {
      const body = JSON.stringify({ path: pathname, hash: window.location.hash });
      try {
        if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
          void fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
        }
      } catch {
        /* ignore */
      }
    };
    send();
    window.addEventListener("hashchange", send);
    return () => window.removeEventListener("hashchange", send);
  }, [pathname]);
  return null;
}
