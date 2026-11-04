"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type Range = { from: string; to: string };
type Preview = { total: number; ranges: { fromNaira: number; toNaira: number; count: number }[]; undo: { count: number; at: string | null } };

/** One-off tool: turn off every on-sale Boost service whose price (₦ per 1k) is in the ranges. Not an automatic rule. */
export function AdminPriceHide({ onChanged }: { onChanged: () => void }) {
  const [ranges, setRanges] = useState<Range[]>([{ from: "0", to: "480" }, { from: "2000", to: "2970" }]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const parsed = ranges.filter((r) => r.from !== "" && r.to !== "").map((r) => ({ fromNaira: Number(r.from), toNaira: Number(r.to) }));

  async function run(action: "preview" | "apply" | "undo") {
    setBusy(true); setMsg(null);
    try {
      if (action === "preview") setPreview(await api<Preview>("/api/admin/services/price-hide", { action, ranges: parsed }));
      if (action === "apply") {
        const r = await api<{ turnedOff: number }>("/api/admin/services/price-hide", { action, ranges: parsed });
        setMsg({ ok: true, text: `Turned off ${r.turnedOff.toLocaleString()} services. Customers can't see them now. Tap “Undo last” to switch them back on.` });
        setPreview(await api<Preview>("/api/admin/services/price-hide", { action: "preview", ranges: parsed }));
        onChanged();
      }
      if (action === "undo") {
        const r = await api<{ turnedOn: number }>("/api/admin/services/price-hide", { action });
        setMsg({ ok: true, text: `Switched ${r.turnedOn.toLocaleString()} services back on.` });
        setPreview(await api<Preview>("/api/admin/services/price-hide", { action: "preview", ranges: parsed }));
        onChanged();
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }
  // Show the counts (and whether there's something to undo) when the panel opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (parsed.length) void run("preview"); }, []);

  return (
    <section className="card glass">
      <h2>Turn off by price</h2>
      <p className="muted" style={{ fontSize: 14 }}>Prices are per 1k, as customers see them. This runs once when you tap the button. It isn&apos;t a rule, so new services or price changes later are not turned off automatically.</p>
      {ranges.map((r, i) => (
        <div key={i} className="vc-price-form">
          <label>From ₦ <input className="input" style={{ width: 110 }} inputMode="decimal" value={r.from} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setRanges((x) => x.map((y, k) => (k === i ? { ...y, from: v } : y))); setPreview(null); }} /></label>
          <label>to ₦ <input className="input" style={{ width: 110 }} inputMode="decimal" value={r.to} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setRanges((x) => x.map((y, k) => (k === i ? { ...y, to: v } : y))); setPreview(null); }} /></label>
          {preview?.ranges[i] && <span className="muted" style={{ fontSize: 13 }}>{preview.ranges[i].count.toLocaleString()} on sale</span>}
          {ranges.length > 1 && <button type="button" className="btn btn-ghost ap-mini" onClick={() => { setRanges((x) => x.filter((_, k) => k !== i)); setPreview(null); }}>Remove</button>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ranges.length < 10 && <button type="button" className="btn btn-ghost ap-mini" onClick={() => { setRanges((x) => [...x, { from: "", to: "" }]); setPreview(null); }}>+ Add a range</button>}
        <button type="button" className="btn btn-ghost ap-mini" disabled={busy || !parsed.length} onClick={() => void run("preview")}>Check how many</button>
        <button type="button" className="btn btn-primary ap-mini" disabled={busy || !preview || preview.total === 0} onClick={() => {
          if (preview && window.confirm(`Turn off ${preview.total.toLocaleString()} Boost services now?`)) void run("apply");
        }}>{preview ? `Turn off ${preview.total.toLocaleString()} services` : "Turn off"}</button>
        {preview && preview.undo.count > 0 && (
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => {
            if (window.confirm(`Switch the last ${preview.undo.count.toLocaleString()} services you turned off back on?`)) void run("undo");
          }}>Undo last ({preview.undo.count.toLocaleString()})</button>
        )}
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
