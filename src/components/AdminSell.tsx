"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Card = { id: string; enabled: boolean; name: string; currency: string; physicalRateKobo: number; ecodeRateKobo: number; min: number; max: number; note: string };
type Coin = { id: string; enabled: boolean; coin: string; network: string; address: string; rateKobo: number; min: number; note: string };
type Config = { enabled: boolean; dailyLimitKobo: number; cards: Card[]; coins: Coin[] };
type Trade = {
  id: string; publicId: number; kind: "giftcard" | "crypto"; item: string; form: string | null; value: number; currency: string; rateKobo: number; payoutKobo: number;
  proof: string; note: string; status: string; paidKobo: number | null; adminNote: string | null; createdAt: string; images: string[];
  customer: { name: string; email: string; newAccount: boolean };
};
type Data = { config: Config; trades: Trade[] };

const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const toNaira = (k: number) => (k ? String(k / 100) : "");
const toKobo = (s: string) => Math.round((Number(s) || 0) * 100);

export function AdminSell() {
  const [data, setData] = useState<Data | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await api<Data>("/api/admin/sell"); setData(d); setCfg(d.config); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: unknown, ok: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/sell", body); setMsg({ ok: true, text: ok }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data || !cfg) return <p className="muted" role="status">Loading…</p>;
  const pending = data.trades.filter((t) => t.status === "pending");
  const setCard = (i: number, p: Partial<Card>) => setCfg({ ...cfg, cards: cfg.cards.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const setCoin = (i: number, p: Partial<Coin>) => setCfg({ ...cfg, coins: cfg.coins.map((c, k) => (k === i ? { ...c, ...p } : c)) });

  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <section className="card glass">
        <h2>To check ({pending.length})</h2>
        {pending.length === 0 ? <div className="empty">Nothing waiting. You&apos;ll get an email when a customer sells you something.</div> : (
          <ul className="vc-admin-list">
            {pending.map((t) => (
              <li key={t.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div>
                  <strong>{t.item}</strong>: {t.value} {t.currency} → pay <b>{naira(t.payoutKobo)}</b> <span className="muted" style={{ fontSize: 12 }}>(rate {naira(t.rateKobo)})</span>
                  <div className="muted" style={{ fontSize: 13 }}>#S-{t.publicId} · {t.customer.name} ({t.customer.email}) · {when(t.createdAt)}{t.customer.newAccount ? " · ⚠ account under 3 days old" : ""}</div>
                  {t.proof && <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{t.kind === "crypto" ? "Transaction" : "Code"}: <code className="ap-code">{t.proof}</code></div>}
                  {t.note && <div style={{ fontSize: 13 }}>Customer note: {t.note}</div>}
                  {t.images.length > 0 && (
                    <div className="sd-thumbs">
                      {t.images.map((src, i) => (
                        <button key={src} type="button" className="sd-thumb" onClick={() => setZoom(src)} aria-label={`Open photo ${i + 1}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- admin-only photo */}
                          <img src={src} alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="vc-price-form">
                  <label>Pay ₦ <input className="input" style={{ width: 130 }} inputMode="decimal" placeholder={String(t.payoutKobo / 100)} value={pay[t.id] ?? ""} onChange={(e) => setPay((p) => ({ ...p, [t.id]: e.target.value }))} /></label>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => {
                    const n = pay[t.id]?.trim() ? Number(pay[t.id]) : t.payoutKobo / 100;
                    if (window.confirm(`Pay ₦${n.toLocaleString("en-NG")} into ${t.customer.name}'s wallet? Only if the ${t.kind === "crypto" ? "crypto has arrived" : "card worked"}.`)) void act({ action: "approve", id: t.id, naira: n }, `Paid ₦${n.toLocaleString("en-NG")} to ${t.customer.name}. They've been emailed.`);
                  }}>Approve & pay</button>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setRejecting(rejecting === t.id ? null : t.id)}>Reject</button>
                </div>
                {rejecting === t.id && (
                  <div className="vc-price-form">
                    <input className="input" style={{ flex: "1 1 220px" }} placeholder="Reason (the customer sees this), e.g. Card already used" value={reason[t.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [t.id]: e.target.value }))} />
                    <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "reject", id: t.id, reason: reason[t.id] ?? "" }, "Rejected. The customer has been emailed.")}>Send rejection</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card glass">
        <h2>What you buy & your rates</h2>
        <label className="ap-toggle"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /><span>Open &ldquo;Sell Gift Cards &amp; Crypto&rdquo; to customers</span></label>
        <div className="field">
          <label htmlFor="sd-limit">Most one customer can sell in 24 hours (₦, empty = no limit)</label>
          <input id="sd-limit" className="input" inputMode="decimal" value={toNaira(cfg.dailyLimitKobo)} onChange={(e) => setCfg({ ...cfg, dailyLimitKobo: toKobo(e.target.value) })} />
        </div>

        <strong>Gift cards</strong>
        {cfg.cards.map((c, i) => (
          <div key={c.id} className="ap-subform" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>🎁 {c.name || "New card"}</strong>
              <span style={{ display: "flex", gap: 8 }}>
                <label className="ap-toggle"><input type="checkbox" checked={c.enabled} onChange={(e) => setCard(i, { enabled: e.target.checked })} /><span>On</span></label>
                <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, cards: cfg.cards.filter((_, k) => k !== i) })}>Remove</button>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "3 1 200px" }}><label htmlFor={`cn-${c.id}`}>Card name</label><input id={`cn-${c.id}`} className="input" value={c.name} onChange={(e) => setCard(i, { name: e.target.value })} placeholder="e.g. Amazon (USA)" /></div>
              <div className="field" style={{ flex: "1 1 80px" }}><label htmlFor={`cc-${c.id}`}>Currency</label><input id={`cc-${c.id}`} className="input" maxLength={3} value={c.currency} onChange={(e) => setCard(i, { currency: e.target.value.toUpperCase() })} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 140px" }}><label htmlFor={`cp-${c.id}`}>₦ per 1 {c.currency || "unit"}: physical</label><input id={`cp-${c.id}`} className="input" inputMode="decimal" value={toNaira(c.physicalRateKobo)} onChange={(e) => setCard(i, { physicalRateKobo: toKobo(e.target.value) })} placeholder="empty = not bought" /></div>
              <div className="field" style={{ flex: "1 1 140px" }}><label htmlFor={`ce-${c.id}`}>₦ per 1 {c.currency || "unit"}: e-code</label><input id={`ce-${c.id}`} className="input" inputMode="decimal" value={toNaira(c.ecodeRateKobo)} onChange={(e) => setCard(i, { ecodeRateKobo: toKobo(e.target.value) })} placeholder="empty = not bought" /></div>
              <div className="field" style={{ flex: "1 1 80px" }}><label htmlFor={`cmin-${c.id}`}>Min value</label><input id={`cmin-${c.id}`} className="input" inputMode="decimal" value={c.min} onChange={(e) => setCard(i, { min: Number(e.target.value) || 0 })} /></div>
              <div className="field" style={{ flex: "1 1 80px" }}><label htmlFor={`cmax-${c.id}`}>Max value</label><input id={`cmax-${c.id}`} className="input" inputMode="decimal" value={c.max} onChange={(e) => setCard(i, { max: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="field"><label htmlFor={`cnote-${c.id}`}>Note for customers (optional)</label><input id={`cnote-${c.id}`} className="input" value={c.note} onChange={(e) => setCard(i, { note: e.target.value })} placeholder="e.g. No receipt needed. Cards from $25." /></div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setCfg({ ...cfg, cards: [...cfg.cards, { id: rid("card"), enabled: true, name: "", currency: "USD", physicalRateKobo: 0, ecodeRateKobo: 0, min: 10, max: 500, note: "" }] })}>+ Add a gift card</button>

        <strong>Crypto</strong>
        {cfg.coins.map((c, i) => (
          <div key={c.id} className="ap-subform" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{c.coin === "BTC" ? "₿" : "🪙"} {c.coin} ({c.network})</strong>
              <span style={{ display: "flex", gap: 8 }}>
                <label className="ap-toggle"><input type="checkbox" checked={c.enabled} onChange={(e) => setCoin(i, { enabled: e.target.checked })} /><span>On</span></label>
                <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, coins: cfg.coins.filter((_, k) => k !== i) })}>Remove</button>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 90px" }}><label htmlFor={`kc-${c.id}`}>Coin</label><input id={`kc-${c.id}`} className="input" value={c.coin} onChange={(e) => setCoin(i, { coin: e.target.value.toUpperCase() })} /></div>
              <div className="field" style={{ flex: "2 1 160px" }}><label htmlFor={`kn-${c.id}`}>Network</label><input id={`kn-${c.id}`} className="input" value={c.network} onChange={(e) => setCoin(i, { network: e.target.value })} /></div>
              <div className="field" style={{ flex: "1 1 130px" }}><label htmlFor={`kr-${c.id}`}>Your rate: ₦ per $1</label><input id={`kr-${c.id}`} className="input" inputMode="decimal" value={toNaira(c.rateKobo)} onChange={(e) => setCoin(i, { rateKobo: toKobo(e.target.value) })} /></div>
              <div className="field" style={{ flex: "1 1 80px" }}><label htmlFor={`km-${c.id}`}>Min $</label><input id={`km-${c.id}`} className="input" inputMode="decimal" value={c.min} onChange={(e) => setCoin(i, { min: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="field"><label htmlFor={`ka-${c.id}`}>Your wallet address (customers send here)</label><input id={`ka-${c.id}`} className="input" spellCheck={false} value={c.address} onChange={(e) => setCoin(i, { address: e.target.value.trim() })} /></div>
            <div className="field"><label htmlFor={`kno-${c.id}`}>Note for customers (optional)</label><input id={`kno-${c.id}`} className="input" value={c.note} onChange={(e) => setCoin(i, { note: e.target.value })} /></div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, coins: [...cfg.coins, { id: rid("usdt"), enabled: true, coin: "USDT", network: "TRC20 (Tron)", address: "", rateKobo: 0, min: 10, note: "" }] })}>+ USDT</button>
          <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, coins: [...cfg.coins, { id: rid("btc"), enabled: true, coin: "BTC", network: "Bitcoin", address: "", rateKobo: 0, min: 20, note: "" }] })}>+ Bitcoin</button>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: "config", config: cfg }, "Saved. Customers see your new rates straight away.")}>{busy ? "Saving…" : "Save"}</button>
      </section>

      <section className="card glass">
        <h2>History</h2>
        {data.trades.filter((t) => t.status !== "pending").length === 0 ? <div className="empty">No completed trades yet.</div> : (
          <ul className="vc-admin-list">
            {data.trades.filter((t) => t.status !== "pending").map((t) => (
              <li key={t.id}>
                <span style={{ minWidth: 0 }}><strong>{t.item}</strong> {t.value} {t.currency} <span className="muted" style={{ fontSize: 12 }}>#S-{t.publicId} · {t.customer.email} · {when(t.createdAt)}{t.adminNote ? ` · ${t.adminNote}` : ""}</span></span>
                <span className={`ap-tag${t.status === "paid" ? " ok" : ""}`}>{t.status === "paid" ? `Paid ${naira(t.paidKobo ?? 0)}` : "Rejected"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {zoom && (
        <div className="ap-sheet-wrap" onClick={() => setZoom(null)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-only photo */}
          <img src={zoom} alt="Gift card photo" className="sd-zoom" />
        </div>
      )}
    </>
  );
}
