"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { guessNetwork, ngPhone } from "@/core/instant";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { BalanceGate, statusTone, usePollPending, type Status } from "./instantUi";

type Plan = { operatorId: number; group?: string; send: number; label: string; priceKobo: number };
type Net = {
  network: string;
  airtime: { operatorId: number; min: number; max: number; per1000Kobo: number } | { operatorId: number; plans: Plan[] } | null;
  data: Plan[];
};
type Topup = { id: string; publicId: number; kind: "airtime" | "data"; network: string; phone: string; description: string; priceKobo: number; status: Status; waiting?: boolean; createdAt: string };

const QUICK = [100, 200, 500, 1000, 2000, 5000];
const STATUS: Record<Status, string> = { pending: "Sending…", delivered: "Sent", refunded: "Refunded", failed: "Not charged" };

export function Airtime({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [nets, setNets] = useState<Net[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"airtime" | "data">("airtime");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState("");
  const [touchedNet, setTouchedNet] = useState(false);
  const [amount, setAmount] = useState("500");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<Topup[]>([]);

  useEffect(() => {
    api<Net[]>("/api/airtime").then((n) => { setNets(n); setNetwork((cur) => cur || n[0]?.network || ""); }).catch((e) => setError((e as Error).message));
    api<Topup[]>("/api/airtime/orders").then(setHistory).catch(() => {});
  }, []);
  const update = useCallback((t: Topup) => setHistory((h) => [t, ...h.filter((x) => x.id !== t.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))), []);
  usePollPending(history, (id) => `/api/airtime/orders/${id}`, update, () => router.refresh());

  // Pick the network from the number (the customer can still change it).
  useEffect(() => {
    if (touchedNet) return;
    const g = guessNetwork(phone);
    if (g && nets?.some((n) => n.network === g)) setNetwork(g);
  }, [phone, nets, touchedNet]);

  const net = nets?.find((n) => n.network === network) ?? null;
  const air = net?.airtime ?? null;
  const rangeAir = air && "min" in air ? air : null;
  const airPlans = air && "plans" in air ? air.plans : null;
  const dataGroups = useMemo(() => {
    const g = new Map<string, Plan[]>();
    for (const p of net?.data ?? []) g.set(p.group ?? network, [...(g.get(p.group ?? network) ?? []), p]);
    return [...g.entries()];
  }, [net, network]);
  useEffect(() => { setPlan(null); setMsg(null); }, [network, kind]);

  const naira = Number(amount);
  const amountOk = rangeAir ? naira >= rangeAir.min && naira <= rangeAir.max : false;
  const validPhone = ngPhone(phone);

  // Exact price for a typed airtime amount.
  useEffect(() => {
    if (kind !== "airtime" || !rangeAir) { setPrice(plan?.priceKobo ?? null); return; }
    if (!amountOk) { setPrice(null); return; }
    let live = true;
    setPrice(Math.ceil((rangeAir.per1000Kobo * naira) / 1000 / 100) * 100);
    const t = setTimeout(() => {
      api<{ priceKobo: number }>(`/api/airtime/quote?operatorId=${rangeAir.operatorId}&naira=${naira}`).then((r) => { if (live) setPrice(r.priceKobo); }).catch(() => {});
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [kind, rangeAir, amountOk, naira, plan]);

  const ready = validPhone && price !== null && (kind === "airtime" ? (rangeAir ? amountOk : Boolean(plan)) : Boolean(plan));

  async function buy() {
    if (!ready || price === null) return;
    setBusy(true); setMsg(null);
    try {
      const payload = kind === "airtime" && rangeAir
        ? { operatorId: rangeAir.operatorId, naira, phone, priceKobo: price }
        : { operatorId: plan!.operatorId, send: plan!.send, phone, priceKobo: price };
      const t = await api<Topup>("/api/airtime", payload);
      update(t);
      router.refresh();
      setMsg(t.status === "delivered"
        ? { ok: true, text: `Done! ${t.description} sent to ${t.phone}.` }
        : t.status === "pending" ? { ok: true, text: t.waiting ? `Your ${t.description} for ${t.phone} is in the queue and will be sent shortly. You're only charged once it's delivered.` : `Sending ${t.description} to ${t.phone}… You'll see it confirmed below.` }
        : { ok: false, text: "The top-up didn't go through. You were not charged." });
      setPlan(null);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card glass">
        <div className="ap-chips" role="group" aria-label="What to buy">
          <button type="button" className="ap-chip" aria-pressed={kind === "airtime"} onClick={() => setKind("airtime")}>Airtime</button>
          <button type="button" className="ap-chip" aria-pressed={kind === "data"} onClick={() => setKind("data")}>Data</button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!nets && !error && <p className="muted" role="status">Loading networks…</p>}
        {nets && (
          <>
            <div className="field">
              <label htmlFor="at-phone">Phone number</label>
              <input id="at-phone" className="input" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" />
              {phone.replace(/\D/g, "").length >= 11 && !validPhone && <span className="form-error" style={{ padding: "6px 10px" }}>Enter a valid Nigerian number.</span>}
            </div>
            <div className="ap-chips ap-chips-wrap" role="group" aria-label="Network">
              {nets.map((n) => <button key={n.network} type="button" className="ap-chip" aria-pressed={n.network === network} onClick={() => { setNetwork(n.network); setTouchedNet(true); }}>{n.network}</button>)}
            </div>
            {validPhone && <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Moved your number to another network? Pick the right one above.</p>}

            {kind === "airtime" && rangeAir && (
              <>
                <div className="es-data" role="group" aria-label="Quick amounts">
                  {QUICK.filter((a) => a >= rangeAir.min && a <= rangeAir.max).map((a) => (
                    <button key={a} type="button" className="es-data-btn" aria-pressed={naira === a} onClick={() => setAmount(String(a))}>₦{a.toLocaleString("en-NG")}</button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="at-amount">Amount (₦{rangeAir.min.toLocaleString("en-NG")} – ₦{rangeAir.max.toLocaleString("en-NG")})</label>
                  <input id="at-amount" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
                </div>
              </>
            )}
            {kind === "airtime" && airPlans && <PlanList groups={[[network, airPlans]]} plan={plan} onPick={setPlan} money={money} />}
            {kind === "airtime" && !air && <div className="empty">Airtime for {network} isn&apos;t available right now.</div>}
            {kind === "data" && (dataGroups.length ? <PlanList groups={dataGroups} plan={plan} onPick={setPlan} money={money} /> : <div className="empty">Data plans for {network} aren&apos;t available right now.</div>)}

            {price !== null && ready && <div className="ap-total"><span>You pay</span><strong>{charge(price)}</strong></div>}
            {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
            {ready && price !== null ? (
              <BalanceGate price={price} balance={balance} onAddMoney={onAddMoney} charge={charge}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void buy()}>
                  {busy ? "Sending…" : `Send ${kind === "airtime" && rangeAir ? `₦${naira.toLocaleString("en-NG")} airtime` : plan?.label ?? ""} to ${validPhone}`}
                </button>
              </BalanceGate>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>{!validPhone ? "Enter the phone number to top up." : kind === "data" || airPlans ? "Pick a plan." : "Enter an amount."}</p>
            )}
            <p className="muted" style={{ fontSize: 12 }}>Sent instantly. If the network can&apos;t deliver, the money goes back to your wallet.</p>
          </>
        )}
      </section>

      {history.length > 0 && (
        <section className="card glass">
          <h2>Recent top-ups</h2>
          <ul className="vc-history">
            {history.map((h) => (
              <li key={h.id}>
                <div><strong>{h.description}</strong> <span className="muted" style={{ fontSize: 13 }}>to {h.phone} · {new Date(h.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ap-tag${statusTone(h.status)}`}>{h.waiting ? "In queue" : STATUS[h.status]}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{h.status === "delivered" || h.status === "pending" ? money(h.priceKobo) : "Not charged"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PlanList({ groups, plan, onPick, money }: { groups: [string, Plan[]][]; plan: Plan | null; onPick: (p: Plan) => void; money: (k: number) => string }) {
  return (
    <>
      {groups.map(([name, plans]) => (
        <div key={name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.length > 1 && <strong style={{ fontSize: 14 }}>{name}</strong>}
          <ul className="ap-services" role="radiogroup" aria-label={name}>
            {plans.map((p) => {
              const on = plan?.operatorId === p.operatorId && plan.send === p.send;
              return (
                <li key={`${p.operatorId}-${p.send}`}>
                  <button type="button" role="radio" aria-checked={on} className={`ap-service${on ? " at-on" : ""}`} onClick={() => onPick(p)}>
                    <span className="ap-service-main"><span className="ap-service-name">{p.label}</span></span>
                    <span className="ap-service-price">{money(p.priceKobo)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
