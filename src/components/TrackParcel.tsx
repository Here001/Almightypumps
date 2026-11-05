"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type Track = {
  code: string; status: string; carrier: string | null; carrierLogo: string | null; carrierTracking: string | null; trackingUrl: string | null;
  from: string; to: string; deliveryTime: string | null; events: { at: string; text: string; location: string | null }[]; bookedAt: string; deliveredAt: string | null;
};
const LABEL: Record<string, string> = { waiting_funds: "Being booked with the courier", booked: "Waiting for pickup", in_transit: "On the way", delivered: "Delivered", cancelled: "Cancelled" };
const STEPS = ["booked", "in_transit", "delivered"];
const when = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); };

/** Public tracking box: real carrier status for packages booked through Almighty Pumps. */
export function TrackParcel({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial);
  const [data, setData] = useState<Track | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function look(c = code) {
    if (!c.trim()) return;
    setBusy(true); setErr(null);
    try {
      setData(await api<Track>(`/api/parcels/track?code=${encodeURIComponent(c.trim())}`));
      window.history.replaceState(null, "", `/track?code=${encodeURIComponent(c.trim().toUpperCase())}`);
    } catch (e) { setData(null); setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (initial) void look(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = data ? STEPS.indexOf(data.status) : -1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <form className="bt-form" onSubmit={(e) => { e.preventDefault(); void look(); }}>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label htmlFor="trk">Tracking number</label>
          <input id="trk" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AP7K3Q9M2X" autoCapitalize="characters" spellCheck={false} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Track"}</button>
      </form>
      {err && <div className="form-error" role="alert">{err}</div>}
      {data && (
        <div className="bt-box" aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: 18 }}>{LABEL[data.status] ?? data.status}</strong>
            <code className="ap-code selectable">{data.code}</code>
          </div>
          <div className="muted">{data.from} → {data.to}{data.carrier ? ` · ${data.carrier}` : ""}{data.deliveryTime ? ` · ${data.deliveryTime}` : ""}</div>
          {data.status !== "cancelled" && (
            <ol className="tr-steps" aria-label="Progress">
              {["Booked", "On the way", "Delivered"].map((l, i) => (
                <li key={l} className={i < step || step === 2 ? "done" : i === step ? "now" : ""}><span className="tr-dot" aria-hidden="true">{i < step || step === 2 ? "✓" : i + 1}</span>{l}</li>
              ))}
            </ol>
          )}
          {data.carrierTracking && <div className="muted" style={{ fontSize: 13 }}>Courier tracking number: <span className="selectable">{data.carrierTracking}</span>{data.trackingUrl && <> · <a href={data.trackingUrl} target="_blank" rel="noopener noreferrer">Courier&apos;s page</a></>}</div>}
          {data.events.length > 0 && (
            <ul className="trk-events">
              {data.events.map((e, i) => <li key={i}><span className="muted">{when(e.at)}</span><span>{e.text}{e.location ? ` · ${e.location}` : ""}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
