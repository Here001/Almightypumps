"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, naira } from "./api";

export function FundWallet() {
  const [amount, setAmount] = useState("5000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ authorizationUrl: string }>("/api/wallet/fund", { amount });
      window.location.href = r.authorizationUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={go} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label htmlFor="fund-amount">Top up amount (₦)</label>
        <input id="fund-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Opening secure checkout…" : "Fund wallet"}</button>
    </form>
  );
}

/** After Flutterwave redirects back with ?tx_ref=...&status=..., confirm the payment once. */
export function PaymentReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get("tx_ref") ?? params.get("ref");
  const cancelled = params.get("status") === "cancelled";
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!ref) return;
    if (cancelled) {
      setMsg("Payment cancelled. Your wallet was not charged.");
      router.replace("/dashboard");
      return;
    }
    api<{ credited: boolean; status: string }>("/api/wallet/verify", { reference: ref })
      .then((r) => {
        setMsg(r.status === "success" ? "Payment received. Your wallet has been topped up." : `Payment status: ${r.status}.`);
        router.replace("/dashboard");
        router.refresh();
      })
      .catch((e) => setMsg((e as Error).message));
  }, [ref, cancelled, router]);
  return msg ? <div className="form-ok" role="status">{msg}</div> : null;
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn btn-ghost" type="button" onClick={async () => { await api("/api/auth/logout", {}); router.push("/"); router.refresh(); }}>
      Log out
    </button>
  );
}
