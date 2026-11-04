"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

type P = {
  id: string; name: string; apiUrl: string; currency: string; markupBps: number; active: boolean;
  apiKeyEnv: string; keySet: boolean; services: number; lastSync: string | null;
  apiKeyHint: string | null; hasStoredKey: boolean; fxKoboPerUnit: number; fxAuto: boolean;
};
type TestResult = { balance: string; currency: string; services: number };

const CURRENCIES = ["NGN", "USD", "EUR", "GBP", "INR"];

type Conn = { id: string; name: string; active: boolean; services: number; onSale: number; shared: number };

/** One place to see every API and connect / disconnect / remove it. */
export function Connections({ list }: { list: Conn[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(id: string, fn: () => Promise<string>) {
    setBusy(id);
    setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }
  return (
    <section className="card glass">
      <h2 style={{ fontSize: 18 }}>Connections</h2>
      <p className="muted" style={{ fontSize: 13 }}>Disconnect an API to stop selling its services. Services that another connected API also sells keep selling through that one automatically.</p>
      <ul className="vc-admin-list">
        {list.map((c) => (
          <li key={c.id}>
            <span style={{ minWidth: 0 }}>
              <strong>{c.name}</strong> <span className={`ap-tag${c.active ? " ok" : ""}`}>{c.active ? "Connected" : "Disconnected"}</span>
              <br /><span className="muted" style={{ fontSize: 13 }}>
                {c.services.toLocaleString("en-NG")} services{c.active ? ` · ${c.onSale.toLocaleString("en-NG")} on sale` : ""}{c.shared ? ` · ${c.shared.toLocaleString("en-NG")} also sold by another API` : ""}
              </span>
            </span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <label className="ap-toggle" style={{ margin: 0 }}>
                <input type="checkbox" role="switch" checked={c.active} disabled={busy !== null} aria-label={`${c.name} connected`}
                  onChange={() => void run(c.id, async () => {
                    if (c.active && !window.confirm(`Disconnect ${c.name}? Its services stop selling now${c.shared ? `; ${c.shared.toLocaleString("en-NG")} shared ones switch to your other API` : ""}. Orders already placed carry on.`)) throw new Error("Nothing changed.");
                    await api(`/api/admin/providers/${c.id}`, { active: !c.active });
                    return c.active ? `${c.name} disconnected.` : `${c.name} connected: its services are on sale again.`;
                  })} />
                <span>{c.active ? "On" : "Off"}</span>
              </label>
              <button type="button" className="btn btn-ghost ap-mini" disabled={busy !== null} onClick={() => void run(c.id, async () => {
                if (!window.confirm(`Remove ${c.name} completely? This deletes its ${c.services.toLocaleString("en-NG")} services from your site.`)) throw new Error("Nothing changed.");
                const res = await fetch(`/api/admin/providers/${c.id}`, { method: "DELETE" });
                const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
                if (!j?.ok) throw new Error(j?.error?.message ?? "Couldn't remove it.");
                return `${c.name} removed.`;
              })}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
      {msg && msg.text !== "Nothing changed." && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}

/** "Add provider": paste a panel's API URL and key, test it, save it. The key is stored encrypted. */
export function AddProvider() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", apiUrl: "", apiKey: "", currency: "NGN", nairaPerUnit: "", markupPercent: "50" });
  const [busy, setBusy] = useState<"test" | "add" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tested, setTested] = useState<TestResult | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setTested(null); };
  const payload = (action: "test" | "add") => ({ action, ...f, nairaPerUnit: f.nairaPerUnit.replace(/[₦,\s]/g, "") || undefined, markupPercent: f.markupPercent || "0" });

  async function go(action: "test" | "add") {
    setBusy(action);
    setMsg(null);
    try {
      if (action === "test") {
        const t = await api<TestResult>("/api/admin/providers", payload("test"));
        setTested(t);
        setF((x) => ({ ...x, currency: t.currency && CURRENCIES.includes(t.currency.toUpperCase()) ? t.currency.toUpperCase() : x.currency }));
        setMsg({ ok: true, text: `Connected ✓ ${t.services.toLocaleString("en-NG")} services found · your balance there: ${t.balance} ${t.currency}` });
      } else {
        const r = await api<{ name: string }>("/api/admin/providers", payload("add"));
        setMsg({ ok: true, text: `“${r.name}” added. Tap “Sync services” on its card below to put its services on sale.` });
        setF({ name: "", apiUrl: "", apiKey: "", currency: "NGN", nairaPerUnit: "", markupPercent: "50" });
        setTested(null);
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <section className="card glass">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 18 }}>Add another provider</h2>
            <p className="muted" style={{ fontSize: 13 }}>Any SMM panel with an “API v2” page: paste its API URL and your key.</p>
          </div>
          <button type="button" className="btn btn-primary ap-mini" onClick={() => { setOpen(true); setMsg(null); }}>+ Add provider</button>
        </div>
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </section>
    );
  }

  return (
    <section className="card glass">
      <h2 style={{ fontSize: 18 }}>Add a provider</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => { e.preventDefault(); void go(tested ? "add" : "test"); }}>
        <div className="field"><label htmlFor="np-name">Name (only you see this)</label>
          <input id="np-name" className="input" value={f.name} onChange={set("name")} placeholder="e.g. JustAnotherPanel" required /></div>
        <div className="field"><label htmlFor="np-url">API URL</label>
          <input id="np-url" className="input" inputMode="url" value={f.apiUrl} onChange={set("apiUrl")} placeholder="https://panel-name.com/api/v2" required />
          <span className="muted" style={{ fontSize: 12 }}>On the panel&apos;s website, open its “API” page. The URL usually ends in /api/v2.</span></div>
        <div className="field"><label htmlFor="np-key">API key</label>
          <input id="np-key" className="input" value={f.apiKey} onChange={set("apiKey")} placeholder="Paste your API key" autoComplete="off" spellCheck={false} required />
          <span className="muted" style={{ fontSize: 12 }}>Stored encrypted. Nobody, including you, can read it back here; you can replace it any time.</span></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 140px" }}><label htmlFor="np-cur">Panel&apos;s currency</label>
            <select id="np-cur" className="select" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c === "NGN" ? "Naira (NGN)" : c}</option>)}
            </select></div>
          {f.currency !== "NGN" && (
            <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="np-fx">₦ per 1 {f.currency} (optional)</label>
              <input id="np-fx" className="input" inputMode="decimal" value={f.nairaPerUnit} onChange={set("nairaPerUnit")} placeholder={f.currency === "USD" ? "Blank = site dollar rate" : "e.g. 1700"} /></div>
          )}
          <div className="field" style={{ flex: "1 1 120px" }}><label htmlFor="np-mk">Your markup (%)</label>
            <input id="np-mk" className="input" inputMode="decimal" value={f.markupPercent} onChange={set("markupPercent")} /></div>
        </div>
        {f.currency !== "NGN" && f.currency !== "USD" && !f.nairaPerUnit && <p className="form-error" role="alert">Enter how many Naira 1 {f.currency} is worth.</p>}
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!tested
            ? <button className="btn btn-primary" disabled={busy !== null}>{busy === "test" ? "Testing…" : "1. Test connection"}</button>
            : <button className="btn btn-primary" disabled={busy !== null}>{busy === "add" ? "Saving…" : "2. Save provider"}</button>}
          <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); setTested(null); }}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

export function ProviderCard({ p }: { p: P }) {
  const router = useRouter();
  const [markup, setMarkup] = useState(String(p.markupBps / 100));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ed, setEd] = useState({ name: p.name, apiUrl: p.apiUrl, apiKey: "", nairaPerUnit: p.fxAuto ? "" : String(p.fxKoboPerUnit / 100) });

  const pct = Number(markup);
  const example = Number.isFinite(pct) && pct >= 0 ? Math.ceil((1000 * (10_000 + Math.round(pct * 100))) / 10_000) : null;

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card glass">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <h2 style={{ fontSize: 20 }}>{p.name} <span className={`status ${p.active ? "ok" : "warn"}`}>{p.active ? "active" : "paused"}</span></h2>
        <span className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{p.apiUrl} · {p.currency}</span>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        {p.services.toLocaleString("en-NG")} services{p.lastSync ? ` · last synced ${p.lastSync}` : " · never synced"}
        {p.currency !== "NGN" && <> · ₦{(p.fxKoboPerUnit / 100).toLocaleString("en-NG")} per 1 {p.currency}{p.fxAuto ? " (site rate, updates on sync)" : ""}</>}
        {" · "}key: {p.hasStoredKey ? `saved ••••${p.apiKeyHint ?? ""}` : p.keySet ? `in Vercel (${p.apiKeyEnv})` : <b style={{ color: "var(--warn)" }}>missing: tap Edit and paste it</b>}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run("markup", async () => {
            const r = await api<{ repriced: number }>(`/api/admin/providers/${p.id}`, { markupPercent: markup });
            return `Markup saved at ${markup}%. ${r.repriced.toLocaleString("en-NG")} services re-priced.`;
          });
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
      >
        <div className="field" style={{ width: 160 }}>
          <label htmlFor={`markup-${p.id}`}>Your markup (%)</label>
          <input id={`markup-${p.id}`} className="input" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy !== null || Number(markup) * 100 === p.markupBps}>{busy === "markup" ? "Saving…" : "Save markup"}</button>
        {example !== null && <span className="muted" style={{ fontSize: 13, paddingBottom: 14 }}>If {p.name} charges ₦1,000, customers pay ₦{example.toLocaleString("en-NG")}</span>}
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => run("sync", async () => {
          const r = await api<{ upserted: number; skipped: number; restricted: number; hidden: number; providerBalance: { balance: string; currency: string } }>(`/api/admin/providers/${p.id}/sync`, {});
          setBalance(`${r.providerBalance.balance} ${r.providerBalance.currency}`);
          const extra = [
            r.skipped ? `${r.skipped.toLocaleString("en-NG")} free or invalid services skipped` : "",
            r.restricted ? `${r.restricted.toLocaleString("en-NG")} fake review/vote services left out` : "",
            r.hidden ? `${r.hidden.toLocaleString("en-NG")} hidden (no longer offered or not allowed)` : "",
          ].filter(Boolean).join("; ");
          return `Synced: ${r.upserted.toLocaleString("en-NG")} services on sale with your ${p.markupBps / 100}% markup.${extra ? ` (${extra}.)` : ""}`;
        })}>{busy === "sync" ? "Syncing…" : "Sync services"}</button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => run("balance", async () => {
          const r = await api<{ balance: string; currency: string }>(`/api/admin/providers/${p.id}/balance`);
          setBalance(`${r.balance} ${r.currency}`);
          return "Balance updated.";
        })}>{busy === "balance" ? "Checking…" : "Check balance"}</button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => run("active", async () => {
          await api(`/api/admin/providers/${p.id}`, { active: !p.active });
          return p.active ? "Disconnected: its services stop selling (shared ones switch to your other API)." : "Connected: its services are on sale again.";
        })}>{busy === "active" ? "Saving…" : p.active ? "Disconnect" : "Connect"}</button>
        <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => { setEditing((v) => !v); setMsg(null); }}>{editing ? "Close edit" : "Edit"}</button>
      </div>
      {editing && (
        <form className="ap-subform" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          run("edit", async () => {
            const fx = ed.nairaPerUnit.replace(/[₦,\s]/g, "");
            const r = await api<{ test: TestResult | null; repriced: number }>(`/api/admin/providers/${p.id}`, {
              name: ed.name !== p.name ? ed.name : undefined,
              apiUrl: ed.apiUrl !== p.apiUrl ? ed.apiUrl : undefined,
              apiKey: ed.apiKey.trim() || undefined,
              nairaPerUnit: p.currency === "NGN" ? undefined : fx ? fx : null,
            });
            setEd((x) => ({ ...x, apiKey: "" }));
            setEditing(false);
            return `Saved.${r.test ? ` Connection OK: ${r.test.services.toLocaleString("en-NG")} services, balance ${r.test.balance} ${r.test.currency}.` : ""}${r.repriced ? ` ${r.repriced.toLocaleString("en-NG")} services re-priced.` : ""}`;
          });
        }}>
          <div className="field"><label htmlFor={`en-${p.id}`}>Name</label>
            <input id={`en-${p.id}`} className="input" value={ed.name} onChange={(e) => setEd((x) => ({ ...x, name: e.target.value }))} /></div>
          <div className="field"><label htmlFor={`eu-${p.id}`}>API URL</label>
            <input id={`eu-${p.id}`} className="input" value={ed.apiUrl} onChange={(e) => setEd((x) => ({ ...x, apiUrl: e.target.value }))} /></div>
          <div className="field"><label htmlFor={`ek-${p.id}`}>Change API key (leave empty to keep the current one)</label>
            <input id={`ek-${p.id}`} className="input" value={ed.apiKey} onChange={(e) => setEd((x) => ({ ...x, apiKey: e.target.value }))} placeholder="Paste a new key" autoComplete="off" spellCheck={false} /></div>
          {p.currency !== "NGN" && (
            <div className="field"><label htmlFor={`ef-${p.id}`}>₦ per 1 {p.currency} (empty = follow the site dollar rate)</label>
              <input id={`ef-${p.id}`} className="input" inputMode="decimal" value={ed.nairaPerUnit} onChange={(e) => setEd((x) => ({ ...x, nairaPerUnit: e.target.value }))} /></div>
          )}
          <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy !== null}>{busy === "edit" ? "Testing & saving…" : "Save changes"}</button>
          <p className="muted" style={{ fontSize: 12 }}>A new key or URL is tested before it&apos;s saved.</p>
        </form>
      )}
      {balance && <p style={{ fontSize: 15 }}>Your balance on {p.name}: <b>{balance}</b></p>}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
