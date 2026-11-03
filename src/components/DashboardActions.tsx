"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

type Service = { id: number; name: string; category: string; rateKobo: number; min: number; max: number; refill: boolean };

export function QuickOrder({ services }: { services: Service[] }) {
  const router = useRouter();
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const [cat, setCat] = useState(categories[0] ?? "");
  const inCat = services.filter((s) => s.category === cat);
  const [serviceId, setServiceId] = useState<number | null>(inCat[0]?.id ?? null);
  const svc = services.find((s) => s.id === serviceId) ?? inCat[0];
  const [link, setLink] = useState("");
  const [qty, setQty] = useState(String(svc?.min ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!services.length) return <div className="empty">No services yet. An admin needs to add a provider and run a sync.</div>;

  const q = Number(qty);
  const total = svc && Number.isInteger(q) && q > 0 ? Math.max(1, Math.ceil((svc.rateKobo * q) / 1000)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!svc) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const o = await api<{ publicId: number }>("/api/smm/orders", { service: svc.id, link, quantity: q });
      setOk(`Order #${o.publicId} placed. ${naira(total)} is held and only charged as it delivers.`);
      setLink("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label htmlFor="qo-cat">Platform</label>
        <select id="qo-cat" className="select" value={cat} onChange={(e) => { setCat(e.target.value); const first = services.find((s) => s.category === e.target.value); setServiceId(first?.id ?? null); setQty(String(first?.min ?? 100)); }}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="qo-svc">Service</label>
        <select id="qo-svc" className="select" value={svc?.id ?? ""} onChange={(e) => { const s = services.find((x) => x.id === Number(e.target.value)); setServiceId(s?.id ?? null); setQty(String(s?.min ?? 100)); }}>
          {inCat.map((s) => <option key={s.id} value={s.id}>{s.name} · {naira(s.rateKobo)}/1k{s.refill ? " · refill" : ""}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="qo-link">Post or profile link</label>
        <input id="qo-link" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" required />
      </div>
      <div className="field">
        <label htmlFor="qo-qty">Quantity {svc && <span className="muted">({svc.min.toLocaleString()}–{svc.max.toLocaleString()})</span>}</label>
        <input id="qo-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Total</span><strong>{naira(total)}</strong></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <button className="btn btn-primary" disabled={busy || !svc}>{busy ? "Placing order…" : "Place order"}</button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn btn-ghost" type="button" onClick={async () => { await api("/api/auth/logout", {}); router.push("/"); router.refresh(); }}>
      Log out
    </button>
  );
}
