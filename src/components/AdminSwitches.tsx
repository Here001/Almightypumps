"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type S = { id: string; label: string; hint: string; on: boolean };
type Tile = { id: string; label: string };

/** One on/off switch per customer service. */
export function AdminSwitches() {
  const [list, setList] = useState<S[] | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api<{ services: S[]; tiles: Tile[] }>("/api/admin/switches").then((d) => { setList(d.services); setTiles(d.tiles); }).catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, []);

  async function toggle(s: S) {
    setBusy(s.id); setMsg(null);
    try {
      await api("/api/admin/switches", { id: s.id, on: !s.on });
      setList((l) => l?.map((x) => (x.id === s.id ? { ...x, on: !s.on } : x)) ?? null);
      setMsg({ ok: true, text: `${s.label} is now ${s.on ? "OFF" : "ON"}.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  /** Move a tile to a new position (0 = first) and save straight away. */
  async function move(from: number, to: number) {
    if (to < 0 || to >= tiles.length || from === to) return;
    const next = [...tiles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    const before = tiles;
    setTiles(next); setSaving(true); setMsg(null);
    try { await api("/api/admin/switches", { order: next.map((x) => x.id) }); setMsg({ ok: true, text: `${t.label} is now ${ordinal(to + 1)}.` }); }
    catch (e) { setTiles(before); setMsg({ ok: false, text: (e as Error).message }); }
    finally { setSaving(false); }
  }

  if (!list) return msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>;
  return (
    <>
    {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
    <section className="card glass">
      <h2>Order on the Services page</h2>
      <p className="muted" style={{ fontSize: 14 }}>Choose which tile customers see 1st, 2nd, 3rd… Use the arrows or pick a position. Tiles that are switched off keep their place for when you switch them back on.</p>
      <ol className="ord-list">
        {tiles.map((t, i) => (
          <li key={t.id}>
            <span className="ord-n" aria-hidden="true">{i + 1}</span>
            <strong className="ord-label">{t.label}{list.find((s) => s.id === t.id && !s.on) && <span className="muted" style={{ fontWeight: 400 }}> · off</span>}</strong>
            <select className="select ord-pos" aria-label={`Position of ${t.label}`} value={i} disabled={saving} onChange={(e) => void move(i, Number(e.target.value))}>
              {tiles.map((_, k) => <option key={k} value={k}>{ordinal(k + 1)}</option>)}
            </select>
            <button type="button" className="btn btn-ghost ap-mini ord-btn" aria-label={`Move ${t.label} up`} disabled={saving || i === 0} onClick={() => void move(i, i - 1)}>↑</button>
            <button type="button" className="btn btn-ghost ap-mini ord-btn" aria-label={`Move ${t.label} down`} disabled={saving || i === tiles.length - 1} onClick={() => void move(i, i + 1)}>↓</button>
          </li>
        ))}
      </ol>
    </section>
    <section className="card glass">
      <h2>Switch services on or off</h2>
      <ul className="sw-list">
        {list.map((s) => (
          <li key={s.id}>
            <div style={{ minWidth: 0 }}><strong>{s.label}</strong><span className="muted">{s.hint}</span></div>
            <button type="button" role="switch" aria-checked={s.on} aria-label={`${s.label}: ${s.on ? "on" : "off"}`} className={`sw${s.on ? " on" : ""}`} disabled={busy === s.id} onClick={() => void toggle(s)}>
              <span className="sw-knob" aria-hidden="true" /><span className="sw-text">{s.on ? "ON" : "OFF"}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: 13 }}>Shop categories you created are switched on/off from the Shop page (pause their products). Price settings stay as they are while a service is off.</p>
    </section>
    </>
  );
}

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
