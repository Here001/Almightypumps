"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Copy } from "./instantUi";

type Account = { id: string; kind: "onetime" | "permanent"; accountNumber: string; bankName: string; accountName: string | null; amountKobo: number | null; expiresAt: string | null; status: string };
type Data = { enabled: boolean; permanentAllowed: boolean; minKobo: number; permanent: Account | null; onetime: Account | null };

function useLeft(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!iso) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "";
  const m = Math.floor(ms / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function AccountBox({ a, charge }: { a: Account; charge: (k: number) => string }) {
  const left = useLeft(a.kind === "onetime" ? a.expiresAt : null);
  return (
    <div className="bt-box">
      {a.kind === "onetime" && a.amountKobo != null && <div className="bt-amount">Send exactly <b>{charge(a.amountKobo)}</b></div>}
      <dl className="ap-facts">
        <dt>Bank</dt><dd>{a.bankName}</dd>
        <dt>Account number</dt><dd><code className="ap-code bt-num">{a.accountNumber}</code> <Copy text={a.accountNumber} /></dd>
        {a.accountName && <><dt>Account name</dt><dd>{a.accountName}</dd></>}
      </dl>
      {a.kind === "onetime" && (left
        ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>This account number works for <b className="tr-clock">{left}</b>. Send the exact amount in one transfer.</p>
        : <p className="form-error" style={{ margin: 0 }}>This account number has expired. Don&apos;t send money to it. Get a new one below.</p>)}
      {a.kind === "permanent" && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Your own account number. Send any amount, any time, from any bank app. Save it as a beneficiary.</p>}
    </div>
  );
}

/** Automatic bank-transfer top-ups: a one-time account (no BVN) or the customer's own permanent account (BVN once). */
export function BankTransfer() {
  const router = useRouter();
  const { charge } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [amount, setAmount] = useState("5000");
  const [bvn, setBvn] = useState("");
  const [consent, setConsent] = useState(false);
  const [showBvn, setShowBvn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => api<Data>("/api/wallet/bank-transfer").then(setData).catch(() => setData(null)), []);
  useEffect(() => { void load(); }, [load]);

  if (!data?.enabled) return null;

  async function act(body: Record<string, unknown>, ok?: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ credited?: number }>("/api/wallet/bank-transfer", body);
      if (body.action === "check") {
        setMsg(r.credited ? { ok: true, text: "Received! Your wallet has been topped up." } : { ok: true, text: "Not received yet. Transfers usually arrive within a few minutes; we'll add it automatically as soon as it lands." });
        if (r.credited) router.refresh();
      } else if (ok) setMsg({ ok: true, text: ok });
      setBvn(""); setShowBvn(false);
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <h2>Bank transfer · automatic</h2>
      <p className="muted" style={{ fontSize: 14 }}>Transfer from any Nigerian bank app. Your wallet is topped up automatically within minutes, no need to send proof.</p>

      {data.permanent && <AccountBox a={data.permanent} charge={charge} />}

      {data.onetime && <AccountBox a={data.onetime} charge={charge} />}

      {!data.permanent && (
        <form className="bt-form" onSubmit={(e) => { e.preventDefault(); void act({ action: "onetime", amount }); }}>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="bt-amount">{data.onetime ? "New amount (₦)" : "Amount to top up (₦)"}</label>
            <input id="bt-amount" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="muted" style={{ fontSize: 12 }}>Minimum {charge(data.minKobo)}</span>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Getting account…" : data.onetime ? "Get a new account number" : "Get account number"}</button>
        </form>
      )}

      {(data.permanent || data.onetime) && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: "check" })}>I&apos;ve sent it: check now</button>
      )}

      {!data.permanent && data.permanentAllowed && (
        !showBvn ? (
          <button type="button" className="ap-link" style={{ alignSelf: "flex-start", fontSize: 14 }} onClick={() => setShowBvn(true)}>Want your own permanent account number? Add your BVN</button>
        ) : (
          <form className="ap-subform" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); void act({ action: "permanent", bvn, consent }, "Your personal account number is ready."); }}>
            <strong>Your own account number</strong>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Banking rules require your BVN to open a personal account number. It&apos;s sent securely to our payment partner Flutterwave to confirm who you are. We don&apos;t keep it, and it can&apos;t be used to take money from you. The name on your Almighty Pumps account should match your bank records.</p>
            <div className="field">
              <label htmlFor="bt-bvn">BVN (11 digits)</label>
              <input id="bt-bvn" className="input" inputMode="numeric" autoComplete="off" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))} />
              <span className="muted" style={{ fontSize: 12 }}>Don&apos;t know it? Dial *565*0# from the phone number linked to your bank.</span>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I agree to my BVN being shared with Flutterwave to create my account number.</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary ap-mini" disabled={busy || bvn.length !== 11 || !consent}>{busy ? "Creating…" : "Create my account number"}</button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setShowBvn(false)}>Cancel</button>
            </div>
          </form>
        )
      )}

      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
