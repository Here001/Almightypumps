"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Row = {
  name: string; label: string; defaults: { max: number; windowSec: number }; current: { max: number; windowSec: number };
  overridden: boolean; requests: number; blocked: number; keys: number;
};

const per = (s: number) => s >= 86400 ? "per day" : s >= 3600 ? `per ${s / 3600 === 1 ? "hour" : `${s / 3600} hours`}` : s >= 60 ? `per ${s / 60 === 1 ? "minute" : `${s / 60} minutes`}` : `per ${s} seconds`;
const GROUPS: [string, (n: string) => boolean][] = [
  ["Whole site & cost control", (n) => /^(writeIp|writeNet|catalogIp|upstreamPoll|emailNotice|emailTo|track|apiKeyFail)$/.test(n)],
  ["Sign-in & account", (n) => /^(login|register|password|emailCode|nameChange|apiKey)/.test(n)],
  ["Money", (n) => /^(fund|withdraw|bank)/.test(n)],
  ["Buying", (n) => /^(order|buy|verify|ship|trackParcel)/.test(n)],
  ["P2P, sellers & support", (n) => /^(tradeAction|message|seller|avatar|listing|support)/.test(n)],
  ["Reseller API", (n) => /^resellerApi/.test(n)],
];

export function AdminLimits() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<Row[]>("/api/admin/limits").then(setRows).catch((e) => setMsg({ ok: false, text: (e as Error).message })), []);
  useEffect(() => { void load(); }, [load]);

  async function save(name: string, reset = false) {
    setBusy(name); setMsg(null);
    try {
      await api("/api/admin/limits", reset ? { rule: name, reset: true } : { rule: name, max: Number(edit[name]) });
      setEdit((e) => { const n = { ...e }; delete n[name]; return n; });
      setMsg({ ok: true, text: reset ? "Back to the default." : "Saved. It applies within a minute." });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  if (!rows) return <section className="card glass"><p className="muted" role="status">Loading…</p></section>;
  const blocked = rows.reduce((a, r) => a + r.blocked, 0);
  const hot = rows.filter((r) => r.blocked > 0).sort((a, b) => b.blocked - a.blocked);
  return (
    <>
      <section className="card glass">
        <h2>Last 24 hours</h2>
        <p style={{ margin: 0 }}>{blocked === 0 ? "Nothing was blocked. All quiet." : `${blocked.toLocaleString()} request${blocked === 1 ? " was" : "s were"} blocked.`}</p>
        {hot.length > 0 && <ul className="ap-list">{hot.slice(0, 6).map((r) => <li key={r.name} className="ap-row"><span>{r.label}</span><span className="ap-tag">{r.blocked.toLocaleString()} blocked</span></li>)}</ul>}
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>A few blocks are normal (someone mistyping a password, a bot). Lots of blocks on one line may mean an attack, or a limit that is too low for a real busy customer: raise it below.</p>
      </section>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
      {GROUPS.map(([title, test]) => (
        <section key={title} className="card glass">
          <h2>{title}</h2>
          <ul className="ap-list">
            {rows.filter((r) => test(r.name)).map((r) => (
              <li key={r.name} className="ap-row lim-row">
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title">{r.label}</div>
                  <div className="muted ap-row-sub">{r.requests.toLocaleString()} used{r.blocked ? ` · ${r.blocked.toLocaleString()} blocked` : ""} in 24 h{r.overridden ? ` · default ${r.defaults.max.toLocaleString()}` : ""}</div>
                </div>
                <div className="lim-edit">
                  <input className="input" inputMode="numeric" aria-label={`Limit for ${r.label}`} value={edit[r.name] ?? String(r.current.max)}
                    onChange={(e) => setEdit((x) => ({ ...x, [r.name]: e.target.value.replace(/\D/g, "") }))} />
                  <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{per(r.current.windowSec)}</span>
                  {edit[r.name] !== undefined && edit[r.name] !== String(r.current.max) && <button type="button" className="btn btn-primary ap-mini" disabled={busy === r.name || !edit[r.name]} onClick={() => void save(r.name)}>Save</button>}
                  {r.overridden && <button type="button" className="ap-link" disabled={busy === r.name} onClick={() => void save(r.name, true)}>Default</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
