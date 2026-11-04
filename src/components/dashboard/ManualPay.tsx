"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Copy } from "./instantUi";

type Method = {
  id: string; kind: "bank" | "crypto"; label: string; note: string;
  bankName?: string; accountNumber?: string; accountName?: string;
  coin?: string; network?: string; address?: string; stable?: boolean; qr?: string;
};
type Deposit = { id: string; publicId: number; method: string; amountKobo: number; payAmount: string; status: "pending" | "confirmed" | "rejected"; creditedKobo: number | null; note: string | null; createdAt: string };
type Data = { enabled: boolean; reference: string; minKobo: number; maxKobo: number; cryptoRateKobo: number; methods: Method[]; deposits: Deposit[] };

const STATUS = { pending: "Waiting for us to confirm", confirmed: "Added to wallet", rejected: "Not confirmed" } as const;

/** Wallet tab: pay by bank transfer or crypto, then tap "I have made payment". */
export function ManualPay() {
  const { money } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("5000");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<Data>("/api/wallet/manual").then((d) => { setData(d); setMethodId((cur) => cur || d.methods[0]?.id || ""); }).catch(() => setData(null));
  useEffect(() => { void load(); }, []);

  if (!data || (!data.enabled && data.deposits.length === 0)) return null;
  const m = data.methods.find((x) => x.id === methodId) ?? null;
  const naira = Number(amount.replace(/,/g, ""));
  const kobo = Math.round(naira * 100);
  const amountOk = kobo >= data.minKobo && kobo <= data.maxKobo;
  const usd = data.cryptoRateKobo > 0 ? Math.ceil((kobo / data.cryptoRateKobo) * 100) / 100 : 0;
  const send = !m ? "" : m.kind === "bank" ? `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : m.stable ? `${usd.toFixed(2)} ${m.coin}` : `$${usd.toFixed(2)} worth of ${m.coin}`;

  async function submit() {
    if (!m) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/wallet/manual", { methodId: m.id, amount: naira, proof });
      setMsg({ ok: true, text: "Thanks! We've been notified and will check your payment. Your wallet is funded as soon as we confirm it, and we'll email you." });
      setProof("");
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card glass">
      <h2>Pay by bank transfer or crypto</h2>
      {data.enabled && m && (
        <>
          <p className="muted" style={{ fontSize: 14 }}>Pay us directly, then tap &ldquo;I have made payment&rdquo;. We check it and fund your wallet, usually within an hour (9am–9pm).</p>
          <div className="ap-chips ap-chips-wrap" role="group" aria-label="How you'll pay">
            {data.methods.map((x) => <button key={x.id} type="button" className="ap-chip" aria-pressed={x.id === methodId} onClick={() => { setMethodId(x.id); setMsg(null); }}>{x.label}</button>)}
          </div>
          <div className="field">
            <label htmlFor="mp-amount">Amount to add to your wallet (₦)</label>
            <input id="mp-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
            {!amountOk && naira > 0 && <span className="form-error" style={{ padding: "6px 10px" }}>Minimum ₦{(data.minKobo / 100).toLocaleString("en-NG")}.</span>}
          </div>

          {amountOk && (
            <div className="mp-box">
              <div className="es-step"><span className="es-num">1</span><strong>Send exactly {send}</strong></div>
              {m.kind === "bank" ? (
                <dl className="ap-facts">
                  <dt>Bank</dt><dd>{m.bankName}</dd>
                  <dt>Account number</dt><dd><code className="ap-code">{m.accountNumber}</code> <Copy text={m.accountNumber ?? ""} /></dd>
                  <dt>Account name</dt><dd>{m.accountName}</dd>
                  <dt>Amount</dt><dd><b>{send}</b> <Copy text={String(naira)} /></dd>
                  <dt>Narration</dt><dd><code className="ap-code">{data.reference}</code> <Copy text={data.reference} /></dd>
                </dl>
              ) : (
                <>
                  <dl className="ap-facts">
                    <dt>Coin</dt><dd>{m.coin}</dd>
                    <dt>Network</dt><dd><b>{m.network}</b></dd>
                    <dt>Amount</dt><dd><b>{send}</b>{m.stable && <> <Copy text={usd.toFixed(2)} /></>}</dd>
                    <dt>Address</dt><dd><code className="ap-code" style={{ overflowWrap: "anywhere" }}>{m.address}</code> <Copy text={m.address ?? ""} /></dd>
                  </dl>
                  {m.qr && (
                    <div className="es-qr">
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated QR */}
                      <img src={m.qr} alt={`${m.coin} address QR code`} width={180} height={180} />
                    </div>
                  )}
                  <div className="form-error" role="note" style={{ fontSize: 13 }}>Send only {m.coin} on the <b>{m.network}</b> network. Anything else sent to this address is lost. Network fees are on you: we credit what arrives.</div>
                  {!m.stable && <p style={{ fontSize: 13 }}>Tip: in your wallet app, switch the amount to dollars (USD) and enter <b>${usd.toFixed(2)}</b>. We credit you based on the dollar value that arrives.</p>}
                  <p className="muted" style={{ fontSize: 12 }}>Rate: ₦{(data.cryptoRateKobo / 100).toLocaleString("en-NG")} per $1.</p>
                </>
              )}
              {m.note && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.note}</p>}
              <div className="es-step"><span className="es-num">2</span><strong>Tell us you&apos;ve paid</strong></div>
              <div className="field">
                <label htmlFor="mp-proof">{m.kind === "crypto" ? "Transaction ID (hash)" : "Name on the account you paid from"}</label>
                <input id="mp-proof" className="input" autoComplete="off" value={proof} onChange={(e) => setProof(e.target.value)} placeholder={m.kind === "crypto" ? "Paste the transaction hash" : "e.g. Ben Ade, Opay"} />
              </div>
              {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
              <button type="button" className="btn btn-primary" disabled={busy || proof.trim().length < 3} onClick={() => void submit()}>{busy ? "Sending…" : "I have made payment"}</button>
              <p className="muted" style={{ fontSize: 12 }}>Only tap this after you&apos;ve actually paid. False claims can get your account closed.</p>
            </div>
          )}
        </>
      )}
      {!data.enabled && <p className="muted" style={{ fontSize: 14 }}>Direct payments are paused right now.</p>}
      {data.deposits.length > 0 && (
        <>
          <strong style={{ fontSize: 14 }}>Your payment notices</strong>
          <ul className="vc-history">
            {data.deposits.map((d) => (
              <li key={d.id}>
                <div><strong>{d.payAmount}</strong> <span className="muted" style={{ fontSize: 13 }}>via {d.method} · #P-{d.publicId} · {new Date(d.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ap-tag${d.status === "confirmed" ? " ok" : ""}`}>{STATUS[d.status]}</span>
                  {d.status === "confirmed" && d.creditedKobo !== null && <span className="muted" style={{ fontSize: 13 }}>+{money(d.creditedKobo)}</span>}
                  {d.note && <span className="muted" style={{ fontSize: 13 }}>Reason: {d.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
