"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

type P = {
  id: string; name: string; apiUrl: string; currency: string; markupBps: number; active: boolean;
  apiKeyEnv: string; keySet: boolean; services: number; lastSync: string | null;
};

export function ProviderCard({ p }: { p: P }) {
  const router = useRouter();
  const [markup, setMarkup] = useState(String(p.markupBps / 100));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const pct = Number(markup);
  const example = Number.isFinite(pct) && pct >= 0 ? Math.ceil(1000 * (1 + pct / 100)) : null;

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
        {!p.keySet && <> · <b style={{ color: "var(--warn)" }}>API key missing:</b> add {p.apiKeyEnv} in Vercel and redeploy</>}
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
          const r = await api<{ upserted: number; skipped: number; hidden: number; providerBalance: { balance: string; currency: string } }>(`/api/admin/providers/${p.id}/sync`, {});
          setBalance(`${r.providerBalance.balance} ${r.providerBalance.currency}`);
          const extra = [
            r.skipped ? `${r.skipped.toLocaleString("en-NG")} free or invalid services skipped` : "",
            r.hidden ? `${r.hidden.toLocaleString("en-NG")} no longer offered, now hidden` : "",
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
          return p.active ? "Paused: customers can't order these services." : "Resumed: services are on sale again.";
        })}>{busy === "active" ? "Saving…" : p.active ? "Pause provider" : "Resume provider"}</button>
      </div>
      {balance && <p style={{ fontSize: 15 }}>Your balance on {p.name}: <b>{balance}</b></p>}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
