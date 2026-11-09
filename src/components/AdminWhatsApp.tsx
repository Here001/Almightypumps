"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";

type Cfg = { enabled: boolean; businessNumber: string; dailyBudgetUsd: number; graphVersion: string };
type Overview = {
  config: Cfg;
  setup: { accessToken: boolean; phoneNumberId: boolean; appSecret: boolean; anthropicKey: boolean; webhookUrl: string; verifyToken: string };
  today: { replies: number; costUsd: number };
  linked: number;
  days: { day: string; replies: number; costUsd: number }[];
  messages: { id: string; phone: string; direction: "in" | "out"; body: string; at: string; customer: { id: string; name: string; email: string } | null }[];
};

const usd = (n: number) => "$" + n.toFixed(2);

/** Admin → WhatsApp agent: switch, budget, setup checklist, recent chats. */
export function AdminWhatsApp() {
  const [d, setD] = useState<Overview | null>(null);
  const [form, setForm] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => api<Overview>("/api/admin/whatsapp").then((o) => { setD(o); setForm(o.config); }).catch((e) => setMsg({ ok: false, text: (e as Error).message })), []);
  useEffect(() => { void load(); }, [load]);

  async function save(patch: Partial<Cfg>, done: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/whatsapp", patch); setMsg({ ok: true, text: done }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (!d || !form) return msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>;
  const s = d.setup;
  const ready = s.accessToken && s.phoneNumberId && s.appSecret && s.anthropicKey && !!d.config.businessNumber;
  const tick = (ok: boolean) => <span aria-hidden="true" style={{ color: ok ? "var(--ok, #4cc38a)" : "var(--danger, #e5484d)" }}>{ok ? "✓" : "✗"}</span>;

  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}

      <section className="card glass">
        <ul className="sw-list">
          <li>
            <div style={{ minWidth: 0 }}>
              <strong>AI replies on WhatsApp</strong>
              <span className="muted">{ready ? "When off, customers get a short message pointing them to the website. Linking still works." : "Finish the setup below before switching on."}</span>
            </div>
            <button type="button" role="switch" aria-checked={d.config.enabled} aria-label={`AI replies: ${d.config.enabled ? "on" : "off"}`} className={`sw${d.config.enabled ? " on" : ""}`} disabled={busy}
              onClick={() => void save({ enabled: !d.config.enabled }, d.config.enabled ? "WhatsApp assistant switched off." : "WhatsApp assistant switched on.")}>
              <span className="sw-knob" aria-hidden="true" /><span className="sw-text">{d.config.enabled ? "ON" : "OFF"}</span>
            </button>
          </li>
        </ul>
        <div className="kv-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
          <div><span className="muted">Replies today</span><br /><strong>{d.today.replies}</strong></div>
          <div><span className="muted">AI cost today</span><br /><strong>{usd(d.today.costUsd)}</strong> <span className="muted">of {usd(d.config.dailyBudgetUsd)}</span></div>
          <div><span className="muted">Linked customers</span><br /><strong>{d.linked}</strong></div>
        </div>
      </section>

      <section className="card glass">
        <h2>Settings</h2>
        <form style={{ display: "grid", gap: 16 }} onSubmit={(e) => { e.preventDefault(); void save({ businessNumber: form.businessNumber, dailyBudgetUsd: form.dailyBudgetUsd, graphVersion: form.graphVersion }, "Saved."); }}>
          <div className="field">
            <label htmlFor="wa-num">Your WhatsApp business number (with country code)</label>
            <input id="wa-num" className="input" inputMode="tel" placeholder="2348012345678" value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
            <span className="muted" style={{ fontSize: 13 }}>Customers&apos; &quot;Link WhatsApp&quot; button opens a chat with this number.</span>
          </div>
          <div className="field">
            <label htmlFor="wa-budget">Daily AI spending limit (US dollars)</label>
            <input id="wa-budget" className="input" type="number" min={0} max={500} step={0.5} value={form.dailyBudgetUsd} onChange={(e) => setForm({ ...form, dailyBudgetUsd: Number(e.target.value) })} />
            <span className="muted" style={{ fontSize: 13 }}>Each reply usually costs about 1 to 4 US cents. When the limit is reached, customers are sent to the website until midnight (Lagos) and you get an email.</span>
          </div>
          <div className="field">
            <label htmlFor="wa-ver">Meta Graph API version</label>
            <input id="wa-ver" className="input" value={form.graphVersion} onChange={(e) => setForm({ ...form, graphVersion: e.target.value })} />
            <span className="muted" style={{ fontSize: 13 }}>Leave as it is unless Meta tells you this version is retired.</span>
          </div>
          <button className="btn btn-primary" disabled={busy}>Save</button>
        </form>
      </section>

      <section className="card glass">
        <h2>Setup checklist</h2>
        <ol style={{ paddingLeft: 20, fontSize: 15, display: "grid", gap: 10 }}>
          <li>{tick(s.anthropicKey)} Claude (AI) key added in Vercel as <code>ANTHROPIC_API_KEY</code>.</li>
          <li>{tick(s.phoneNumberId)} WhatsApp <em>Phone number ID</em> added in Vercel as <code>WHATSAPP_PHONE_NUMBER_ID</code>.</li>
          <li>{tick(s.accessToken)} Permanent access token (System User) added as <code>WHATSAPP_ACCESS_TOKEN</code>.</li>
          <li>{tick(s.appSecret)} App secret (App settings → Basic) added as <code>WHATSAPP_APP_SECRET</code>.</li>
          <li>{tick(!!d.config.businessNumber)} Your business number saved above.</li>
          <li>
            In Meta → WhatsApp → Configuration, set the webhook, then subscribe to the <strong>messages</strong> field:
            <div className="field" style={{ marginTop: 8 }}><label>Callback URL</label><div className="ap-code selectable">{s.webhookUrl}</div></div>
            <div className="field" style={{ marginTop: 8 }}><label>Verify token</label><div className="ap-code selectable">{s.verifyToken}</div></div>
          </li>
        </ol>
      </section>

      <section className="card glass">
        <h2>Recent messages</h2>
        {d.messages.length === 0 ? <p className="muted">No WhatsApp messages yet.</p> : (
          <ul className="selectable" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {d.messages.map((m) => (
              <li key={m.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {m.direction === "in" ? "Customer" : "Assistant"} · {m.phone}
                  {m.customer && <> · <Link href={`/admin/users/${m.customer.id}`}>{m.customer.name}</Link></>}
                  {" · "}{new Date(m.at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{m.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.days.length > 0 && (
        <section className="card glass">
          <h2>Last 14 days</h2>
          <table className="table" style={{ width: "100%", fontSize: 14 }}>
            <thead><tr><th style={{ textAlign: "left" }}>Day</th><th style={{ textAlign: "right" }}>Replies</th><th style={{ textAlign: "right" }}>AI cost</th></tr></thead>
            <tbody>{d.days.map((x) => <tr key={x.day}><td>{x.day}</td><td style={{ textAlign: "right" }}>{x.replies}</td><td style={{ textAlign: "right" }}>{usd(x.costUsd)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
