"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type ThemePref = "dark" | "light" | "system";
const KEY = "ap_theme";
const EVENT = "ap-theme";

/** Runs in <head> before first paint so there's no flash. The 3D homepage ("/") always stays dark. */
export const THEME_BOOT_SCRIPT = `(function(){try{if(location.pathname==='/')return;var t=localStorage.getItem('${KEY}')||'dark';var l=t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);if(l)document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;

export function readThemePref(): ThemePref {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "system" ? t : "dark";
  } catch {
    return "dark";
  }
}

function apply(pathname: string) {
  const pref = readThemePref();
  const light = pathname !== "/" && (pref === "light" || (pref === "system" && window.matchMedia("(prefers-color-scheme: light)").matches));
  if (light) document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

export function setThemePref(pref: ThemePref) {
  try { window.localStorage.setItem(KEY, pref); } catch { /* private mode: applies for this visit only */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps the page theme in sync when navigating (e.g. back to the dark homepage) or when the phone switches light/dark. */
export function ThemeSync() {
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    const run = () => apply(pathname);
    run();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", run);
    window.addEventListener(EVENT, run);
    window.addEventListener("storage", run);
    return () => { mq.removeEventListener("change", run); window.removeEventListener(EVENT, run); window.removeEventListener("storage", run); };
  }, [pathname]);
  return null;
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("dark");
  useEffect(() => { setPref(readThemePref()); }, []);
  return [pref, (p) => { setPref(p); setThemePref(p); }];
}
