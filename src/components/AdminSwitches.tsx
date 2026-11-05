"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type S = { id: string; label: string; hint: string; on: boolean };

/** One on/off switch per customer service. */
export function AdminSwitches() {
  const [list, setList] = useState<S[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api<{ services: S[] }>("/api/admin/switches").then((d) => setList(d.services)).catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, []);

  async function toggle(s: S) {
    setBusy(s.id); setMsg(null);
    try {
      await api("/api/admin/switches", { id: s.id, on: !s.on });
      setList((l) => l?.map((x) => (x.id === s.id ? { ...x, on: !s.on } : x)) ?? null);
      setMsg({ ok: true, text: `${s.label} is now ${s.on ? "OFF" : "ON"}.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  if (!list) return msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>;
  return (
    <section className="card glass">
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
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
  );
}
