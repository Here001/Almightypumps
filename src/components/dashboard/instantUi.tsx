"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

/** Bottom sheet / dialog, closes on Escape or a tap outside. */
export function Sheet({ title, kicker, onClose, children }: { title: string; kicker?: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);
  return createPortal(
    <div className="ap-sheet-wrap" onClick={onClose}>
      <div className="ap-sheet glass" role="dialog" aria-modal="true" aria-labelledby="in-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div style={{ minWidth: 0 }}>
            {kicker && <div className="muted" style={{ fontSize: 13 }}>{kicker}</div>}
            <h2 id="in-sheet-title" className="ap-sheet-title">{title}</h2>
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close" ref={btn}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type Status = "pending" | "delivered" | "refunded" | "failed";
export const statusTone = (s: Status) => (s === "delivered" ? " ok" : "");

/** Re-fetch pending orders every 5 seconds until they settle. */
export function usePollPending<T extends { id: string; status: Status }>(items: T[], url: (id: string) => string, onUpdate: (t: T) => void, onSettled?: () => void) {
  const pendingIds = items.filter((i) => i.status === "pending").map((i) => i.id).join(",");
  const cb = useRef({ onUpdate, onSettled, url });
  cb.current = { onUpdate, onSettled, url };
  useEffect(() => {
    if (!pendingIds) return;
    let stop = false;
    const t = setInterval(async () => {
      for (const id of pendingIds.split(",")) {
        try {
          const n = await api<T>(cb.current.url(id));
          if (stop) return;
          cb.current.onUpdate(n);
          if (n.status !== "pending") cb.current.onSettled?.();
        } catch { /* keep trying */ }
      }
    }, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [pendingIds]);
}

export function BalanceGate({ price, balance, onAddMoney, charge, children }: { price: number; balance: number; onAddMoney: () => void; charge: (k: number) => string; children: ReactNode }) {
  if (price <= balance) return <>{children}</>;
  return (
    <>
      <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(price - balance)} more.</div>
      <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
    </>
  );
}

let regionNames: Intl.DisplayNames | null = null;
/** "US" → "United States". */
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** 🇺🇸 from "US". */
export function flag(code: string): string {
  return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌍";
}
