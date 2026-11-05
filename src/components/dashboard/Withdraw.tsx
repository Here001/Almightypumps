"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NG_BANKS } from "@/core/banks";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { IdentityCheck, useIdentity } from "./IdentityCheck";

type W = {
  id: string; amount: number; status: "requested" | "paid" | "rejected"; note: string | null; bankName: string;
  accountNumber: string; accountName: string; createdAt: string; decidedAt: string | null;
};
type Data = { identityStatus: string; profileName: string; minKobo: number; bank: { bankCode: string; accountNumber: string; accountName: string } | null; withdrawals: W[] };

const STATUS: Record<W["status"], { text: string; ok?: boolean }> = {
  requested: { text: "Waiting to be paid" },
  paid: { text: "Paid", ok: true },
  rejected: { text: "Rejected, money returned" },
};

/** Request a payout to a Nigerian bank account. An admin sends the transfer and marks it paid. */
export function Withdraw({ available, hidden }: { available: number; hidden: boolean }) {
  const router = useRouter();
  const { charge } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: "", bankCode: "", accountNumber: "", accountName: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const identity = useIdentity();

  const load = useCallback(async () => {
    const d = await api<Data>("/api/wallet/withdraw");
    setData(d);
    if (d.bank) setF((x) => ({ ...x, bankCode: x.bankCode || d.bank!.bankCode, accountNumber: x.accountNumber || d.bank!.accountNumber, accountName: x.accountName || d.bank!.accountName }));
  }, []);
  useEffect(() => { void load().catch(() => {}); }, [load]);

  const amountKobo = Math.round(Number(f.amount.replace(/[₦,\s]/g, "")) * 100) || 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section className="card glass">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2>Withdraw to bank</h2>
        {!open && <button type="button" className="btn btn-primary ap-mini" onClick={() => { setOpen(true); setMsg(null); }}>Withdraw</button>}
      </div>
      {!open && msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {open && data && data.identityStatus !== "verified" && (
        <>
          <IdentityCheck compact data={identity.data} reload={() => { void identity.reload(); void load(); }} />
          <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(false)}>Close</button>
        </>
      )}
      {open && data?.identityStatus === "verified" && (
        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            await api("/api/wallet/withdraw", { amount: f.amount.replace(/[₦,\s]/g, ""), bankCode: f.bankCode, accountNumber: f.accountNumber.trim(), accountName: f.accountName });
            setMsg({ ok: true, text: `Withdrawal of ${charge(amountKobo)} requested. We'll send it to your bank, usually within 24 hours.` });
            setOpen(false);
            setF((x) => ({ ...x, amount: "" }));
            await load();
            router.refresh();
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          } finally {
            setBusy(false);
          }
        }}>
          <div className="field">
            <label htmlFor="wd-amount">Amount (₦)</label>
            <input id="wd-amount" className="input" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder={data ? `At least ${(data.minKobo / 100).toLocaleString("en-NG")}` : ""} required />
            <span className="muted" style={{ fontSize: 13 }}>
              Available: {hidden ? "*****" : charge(available)}
              {available > 0 && <> · <button type="button" className="ap-link" onClick={() => setF((x) => ({ ...x, amount: String(available / 100) }))}>Withdraw all</button></>}
            </span>
          </div>
          <div className="field">
            <label htmlFor="wd-bank">Bank</label>
            <select id="wd-bank" className="select" value={f.bankCode} onChange={set("bankCode")} required>
              <option value="">Choose your bank</option>
              {NG_BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wd-acct">Account number</label>
            <input id="wd-acct" className="input" inputMode="numeric" maxLength={10} value={f.accountNumber} onChange={(e) => setF((x) => ({ ...x, accountNumber: e.target.value.replace(/\D/g, "") }))} placeholder="10 digits" required />
          </div>
          <div className="field">
            <label htmlFor="wd-name">Account name</label>
            <input id="wd-name" className="input" value={f.accountName} onChange={set("accountName")} placeholder="Name on the bank account" required />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>The account must be in your own name (<strong className="selectable">{data.profileName}</strong>): we check the name with your bank. The money is set aside from your wallet now and sent by our team, usually within 24 hours.</p>
          {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy || amountKobo <= 0}>{busy ? "Sending request…" : amountKobo > 0 ? `Withdraw ${charge(amountKobo)}` : "Withdraw"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>
          </div>
        </form>
      )}
      {data && data.withdrawals.length > 0 && (
        <ul className="ap-list">
          {data.withdrawals.map((w) => (
            <li key={w.id} className="ap-row">
              <div style={{ minWidth: 0 }}>
                <div className="ap-row-title">{hidden ? "*****" : charge(w.amount)} to {w.bankName} ••{w.accountNumber.slice(-4)}</div>
                <div className="muted ap-row-sub">{new Date(w.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}{w.status === "rejected" && w.note ? ` · ${w.note}` : ""}</div>
              </div>
              <div className="ap-row-end"><span className={`ap-tag${STATUS[w.status].ok ? " ok" : ""}`}>{STATUS[w.status].text}</span></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
