"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useCurrency } from "./Currency";

type Service = { name: string; label: string; popular: boolean; priceKobo: number | null };
type Verification = {
  id: string; service: string; label: string; number: string | null; status: "pending" | "completed" | "refunded" | "failed";
  priceKobo: number; code: string | null; smsText: string | null; endsAt: string | null; createdAt: string;
};

const PAGE = 40;
const fmtNumber = (n: string | null) => {
  if (!n) return "";
  const d = n.replace(/\D/g, "");
  return d.length === 10 ? `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length === 11 && d[0] === "1" ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : `+${d}`;
};
const STATUS: Record<Verification["status"], string> = { pending: "Waiting for code", completed: "Code received", refunded: "Refunded", failed: "Refunded" };

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!endsAt) return null;
  const s = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The number the customer is using right now: polls for the code every 5 seconds. */
function Active({ v, onChange }: { v: Verification; onChange: (v: Verification) => void }) {
  const router = useRouter();
  const { charge } = useCurrency();
  const left = useCountdown(v.status === "pending" ? v.endsAt : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (v.status !== "pending") return;
    let stop = false;
    const tick = async () => {
      try {
        const n = await api<Verification>(`/api/verify/${v.id}`);
        if (!stop) { onChange(n); if (n.status !== "pending") router.refresh(); }
      } catch { /* keep trying */ }
    };
    const t = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [v.id, v.status, onChange, router]);

  return (
    <section className="card glass vc-active" aria-live="polite">
      <div className="vc-head">
        <strong>{v.label}</strong>
        <span className={`ap-tag${v.status === "completed" ? " ok" : ""}`}>{STATUS[v.status]}</span>
      </div>
      {v.number && (
        <div className="vc-number">
          <span>{fmtNumber(v.number)}</span>
          <Copy text={v.number} label="Copy number" />
        </div>
      )}
      {v.status === "pending" && (
        <>
          <p className="muted" style={{ fontSize: 14 }}>
            Enter this number in {v.label}. The code appears here automatically{left ? `. Time left: ${left}` : ""}.
          </p>
          <div className="vc-wait"><span className="vc-dot" aria-hidden="true" /> Waiting for the SMS…</div>
          <p className="muted" style={{ fontSize: 13 }}>You&apos;re only charged {charge(v.priceKobo)} if a code arrives. No code = automatic refund.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
            if (!window.confirm("Cancel this number and get your money back?")) return;
            setBusy(true); setError(null);
            try { onChange(await api<Verification>(`/api/verify/${v.id}`, { action: "cancel" })); router.refresh(); }
            catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? "Cancelling…" : "Cancel & refund"}</button>
        </>
      )}
      {v.status === "completed" && v.code && (
        <>
          <div className="vc-code"><span>{v.code}</span><Copy text={v.code} label="Copy code" /></div>
          {v.smsText && <p className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>“{v.smsText}”</p>}
        </>
      )}
      {(v.status === "refunded" || v.status === "failed") && <div className="form-ok" role="status">No code came in, so {charge(v.priceKobo)} is back in your wallet.</div>}
    </section>
  );
}

export function VerifyCode({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const { money } = useCurrency();
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Service | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [active, setActive] = useState<Verification | null>(null);

  useEffect(() => {
    api<Service[]>("/api/verify/services").then(setServices).catch((e) => setError((e as Error).message));
    api<Verification[]>("/api/verify").then((h) => { setHistory(h); setActive(h.find((x) => x.status === "pending") ?? null); }).catch(() => {});
  }, []);

  const update = useCallback((v: Verification) => {
    setActive(v);
    setHistory((h) => [v, ...h.filter((x) => x.id !== v.id)]);
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, "");
    return (services ?? []).filter((x) => !s || x.name.toLowerCase().replace(/[\s_-]+/g, "").includes(s));
  }, [services, q]);

  return (
    <>
      {active && <Active v={active} onChange={update} />}
      <section className="card glass">
        <h2>Which app is the code for?</h2>
        <p className="muted" style={{ fontSize: 14 }}>Get a US number, receive the SMS code here. You pay only if the code arrives.</p>
        <div className="ap-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" className="input" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search: WhatsApp, Telegram, Google…" aria-label="Search apps" autoComplete="off" />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!services && !error && <p className="muted" role="status">Loading apps…</p>}
        {services && list.length === 0 && <div className="empty">No app matches “{q}”. Try another name.</div>}
        <ul className="ap-services">
          {list.slice(0, shown).map((s) => (
            <li key={s.name}>
              <button type="button" className="ap-service" onClick={() => setPicked(s)}>
                <span className="ap-service-main">
                  <span className="ap-service-name">{s.label}</span>
                  {s.popular && <span className="ap-service-meta"><span className="ap-tag ok">Popular</span></span>}
                </span>
                <span className="ap-service-price">{s.priceKobo ? money(s.priceKobo) : "See price"}</span>
              </button>
            </li>
          ))}
        </ul>
        {list.length > shown && <button type="button" className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)}>Show more ({list.length - shown} left)</button>}
      </section>

      {history.filter((h) => h.id !== active?.id).length > 0 && (
        <section className="card glass">
          <h2>Recent codes</h2>
          <ul className="vc-history">
            {history.filter((h) => h.id !== active?.id).map((h) => (
              <li key={h.id}>
                <div><strong>{h.label}</strong> <span className="muted" style={{ fontSize: 13 }}>{fmtNumber(h.number)} · {new Date(h.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {h.code ? <code className="ap-code">{h.code}</code> : <span className="ap-tag">{STATUS[h.status]}</span>}
                  <span className="muted" style={{ fontSize: 13 }}>{h.status === "completed" ? money(h.priceKobo) : "Not charged"}</span>
                  {h.status === "pending" && <button type="button" className="ap-link" onClick={() => setActive(h)}>Open</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picked && (
        <BuySheet service={picked} balance={balance} busyElsewhere={active?.status === "pending"}
          onClose={() => setPicked(null)} onAddMoney={() => { setPicked(null); onAddMoney(); }}
          onStarted={(v) => { setPicked(null); update(v); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onPriced={(p) => setServices((all) => all?.map((x) => (x.name === picked.name ? { ...x, priceKobo: p } : x)) ?? all)} />
      )}
    </>
  );
}

function BuySheet({ service, balance, busyElsewhere, onClose, onAddMoney, onStarted, onPriced }: {
  service: Service; balance: number; busyElsewhere: boolean; onClose: () => void; onAddMoney: () => void; onStarted: (v: Verification) => void; onPriced: (kobo: number) => void;
}) {
  const router = useRouter();
  const { charge } = useCurrency();
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const quote = useCallback(async () => {
    setError(null);
    try {
      const q = await api<{ priceKobo: number }>(`/api/verify/quote?service=${encodeURIComponent(service.name)}`);
      setPrice(q.priceKobo);
      onPriced(q.priceKobo);
    } catch (e) {
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.name]);

  // Price once per opened service (the parent re-renders when it learns the price; don't loop).
  useEffect(() => { void quote(); }, [quote]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);

  const short = price !== null && price > balance ? price - balance : 0;

  return createPortal(
    <div className="ap-sheet-wrap" onClick={onClose}>
      <div className="ap-sheet glass" role="dialog" aria-modal="true" aria-labelledby="vc-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 13 }}>Verification code</div>
            <h2 id="vc-sheet-title" className="ap-sheet-title">{service.label}</h2>
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close" ref={ref}>×</button>
        </div>
        <ol className="vc-steps">
          <li>We give you a US mobile number.</li>
          <li>Enter it in {service.label} and request the code.</li>
          <li>The code shows here within a few minutes.</li>
        </ol>
        {price === null && !error && <p className="muted" role="status">Checking today&apos;s price…</p>}
        {price !== null && (
          <div className="ap-total"><span>Price</span><strong>{charge(price)}</strong></div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>🔒 Pay only if the code arrives. No code, or you cancel: full refund to your wallet.</p>
        {busyElsewhere && <div className="form-error" role="alert">You already have a number waiting for a code. Finish or cancel it first.</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {price !== null && !busyElsewhere && (short > 0 ? (
          <>
            <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(short)} more.</div>
            <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const v = await api<Verification>("/api/verify", { service: service.name, priceKobo: price });
              router.refresh();
              onStarted(v);
            } catch (e) {
              const msg = (e as Error).message;
              setError(msg);
              if (msg.includes("price just changed")) void quote();
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Getting your number…" : `Get number for ${charge(price)}`}</button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
