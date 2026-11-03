"use client";

import { useEffect, useMemo, useState } from "react";
import { api, naira } from "./api";

type Rule = { platform: string; kind: string | null; markupBps: number };
type Group = { platform: string; kind: string; count: number };
type Usd = {
  mode: "auto" | "manual"; manualKobo: number; marketKobo: number; adjustBps: number;
  updatedAt: string | null; source: string | null; lastError: string | null; effectiveKobo: number;
};
type Overview = { rules: Rule[]; groups: Group[]; providers: { name: string; markupBps: number }[]; minOrderKobo: number; usd: Usd };

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;

export function AdminPricing() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("");

  async function refresh() {
    try {
      setData(await api<Overview>("/api/admin/pricing"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void refresh(); }, []);

  const platforms = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of data?.groups ?? []) m.set(g.platform, [...(m.get(g.platform) ?? []), g]);
    return [...m.entries()].map(([name, kinds]) => ({ name, kinds, count: kinds.reduce((a, k) => a + k.count, 0) })).sort((a, b) => b.count - a.count);
  }, [data]);

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Loading…</p>;

  const defaultBps = data.providers[0]?.markupBps ?? 0;
  const rule = (p: string, k: string | null) => data.rules.find((r) => r.platform === p && r.kind === k);
  const current = platforms.find((p) => p.name === platform);
  const platformRule = current ? rule(current.name, null) : undefined;

  return (
    <>
      <MinOrder minOrderKobo={data.minOrderKobo} onSaved={refresh} />
      <DollarRate usd={data.usd} onSaved={refresh} />

      <section className="card glass">
        <h2>Markup by platform and type</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          The most specific setting wins: <b>type</b> (e.g. Instagram Followers) → <b>platform</b> (all Instagram) → <b>provider default</b>
          {data.providers.map((p) => ` (${p.name}: ${pct(p.markupBps)})`).join("")}. Leave a box empty to use the next one up.
        </p>

        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="pr-platform">Platform</label>
          <select id="pr-platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Choose a platform…</option>
            {platforms.map((p) => {
              const r = rule(p.name, null);
              const typeRules = data.rules.filter((x) => x.platform === p.name && x.kind !== null).length;
              return <option key={p.name} value={p.name}>{p.name} ({p.count.toLocaleString("en-NG")}){r ? ` · ${pct(r.markupBps)}` : ""}{typeRules ? ` · ${typeRules} type rule${typeRules > 1 ? "s" : ""}` : ""}</option>;
            })}
          </select>
        </div>

        {current && (
          <div className="ap-list">
            <MarkupRow
              key={`${current.name}-all`} label={`All ${current.name}`} sub={`${current.count.toLocaleString("en-NG")} services`} strong
              platform={current.name} kind={null} ruleBps={platformRule?.markupBps} inheritedBps={defaultBps} inheritedFrom="provider default" onSaved={refresh}
            />
            {current.kinds.map((k) => (
              <MarkupRow
                key={`${current.name}-${k.kind}`} label={k.kind} sub={`${k.count.toLocaleString("en-NG")} services`}
                platform={current.name} kind={k.kind} ruleBps={rule(current.name, k.kind)?.markupBps}
                inheritedBps={platformRule?.markupBps ?? defaultBps} inheritedFrom={platformRule ? `all ${current.name}` : "provider default"} onSaved={refresh}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card glass">
        <h2>Your custom markups</h2>
        {data.rules.length === 0 ? <div className="empty">None yet. Everything uses the provider default.</div> : (
          <ul className="ap-list">
            {data.rules.map((r) => (
              <li key={`${r.platform}-${r.kind ?? ""}`} className="ap-row">
                <div><div className="ap-row-title">{r.platform}{r.kind ? ` · ${r.kind}` : " · all types"}</div></div>
                <div className="ap-row-end"><strong>{pct(r.markupBps)}</strong>
                  <button type="button" className="ap-link" onClick={() => setPlatform(r.platform)}>Edit</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function MarkupRow(props: {
  label: string; sub: string; strong?: boolean; platform: string; kind: string | null;
  ruleBps?: number; inheritedBps: number; inheritedFrom: string; onSaved: () => void;
}) {
  const [value, setValue] = useState(props.ruleBps === undefined ? "" : String(props.ruleBps / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setValue(props.ruleBps === undefined ? "" : String(props.ruleBps / 100)); }, [props.ruleBps]);

  const trimmed = value.trim();
  const changed = trimmed === "" ? props.ruleBps !== undefined : Number(trimmed) * 100 !== props.ruleBps;
  const effective = trimmed === "" || !Number.isFinite(Number(trimmed)) ? props.inheritedBps : Math.round(Number(trimmed) * 100);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ repriced: number }>("/api/admin/pricing", { type: "rule", platform: props.platform, kind: props.kind, markupPercent: trimmed === "" ? null : trimmed });
      setMsg({ ok: true, text: `${trimmed === "" ? "Using " + props.inheritedFrom : "Saved"}. ${r.repriced.toLocaleString("en-NG")} services re-priced.` });
      props.onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-row" style={{ flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 180px" }}>
        <div className="ap-row-title" style={props.strong ? { fontWeight: 700 } : undefined}>{props.label}</div>
        <div className="muted ap-row-sub">{props.sub} · ₦1,000 cost sells for {naira(Math.ceil((100_000 * (10_000 + effective)) / 10_000))}</div>
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} style={{ marginTop: 8, padding: "8px 12px" }} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </div>
      <form className="ap-markup" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input
          className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={`${(props.inheritedBps / 100).toLocaleString("en-NG")} (${props.inheritedFrom})`}
          aria-label={`Markup % for ${props.platform} ${props.kind ?? "all types"}`}
        />
        <span className="muted">%</span>
        <button className="btn btn-ghost ap-mini" disabled={busy || !changed}>{busy ? "Saving…" : trimmed === "" && props.ruleBps !== undefined ? "Clear" : "Save"}</button>
      </form>
    </div>
  );
}

function MinOrder({ minOrderKobo, onSaved }: { minOrderKobo: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(minOrderKobo / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="card glass">
      <h2>Minimum order amount</h2>
      <p className="muted" style={{ fontSize: 14 }}>Customers can&apos;t place a growth order below this. Set 0 for no minimum. Applies to the website and the reseller API.</p>
      <form
        style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            const r = await api<{ minOrderKobo: number }>("/api/admin/pricing", { type: "min", minOrderNaira: value });
            setMsg({ ok: true, text: r.minOrderKobo ? `Minimum order is now ${naira(r.minOrderKobo)}.` : "No minimum order." });
            onSaved();
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field" style={{ width: 180 }}>
          <label htmlFor="min-order">Minimum (₦)</label>
          <input id="min-order" className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || Number(value) * 100 === minOrderKobo}>{busy ? "Saving…" : "Save minimum"}</button>
      </form>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}

function DollarRate({ usd, onSaved }: { usd: Usd; onSaved: () => void }) {
  const [mode, setMode] = useState(usd.mode);
  const [manual, setManual] = useState(usd.manualKobo ? String(usd.manualKobo / 100) : "");
  const [adjust, setAdjust] = useState(String(usd.adjustBps / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/pricing", body);
      setMsg({ ok: true, text: ok });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const when = usd.updatedAt ? new Date(usd.updatedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : null;

  return (
    <section className="card glass">
      <h2>Dollar prices</h2>
      <p className="muted" style={{ fontSize: 14 }}>
        Customers can switch prices between Naira and Dollars. Dollar prices are for display: customers are always charged in Naira.
      </p>
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Rate mode">
        <button type="button" className="ap-chip" aria-pressed={mode === "auto"} onClick={() => setMode("auto")}>Automatic</button>
        <button type="button" className="ap-chip" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>Manual</button>
      </div>

      {mode === "auto" ? (
        <>
          <div className="ap-row" style={{ borderBottom: 0 }}>
            <div>
              <div className="ap-row-title">Market rate: {usd.marketKobo ? `${naira(usd.marketKobo)} = US$1` : "not fetched yet"}</div>
              <div className="muted ap-row-sub">{when ? `Updated ${when} from ${usd.source}. Refreshes every 6 hours.` : "Fetched automatically every 6 hours."}</div>
              {usd.lastError && <div className="muted ap-row-sub" style={{ color: "var(--warn)" }}>Last refresh failed ({usd.lastError.replace(/^\S+: /, "")}); still using the last good rate.</div>}
            </div>
            <div className="ap-row-end">
              <strong>{usd.effectiveKobo ? `${naira(usd.effectiveKobo)} = $1` : "Dollars off"}</strong>
              <span className="muted ap-row-sub">what customers see</span>
            </div>
          </div>
          <form style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
            onSubmit={(e) => { e.preventDefault(); void send({ type: "usd", mode: "auto", adjustPercent: adjust || 0 }, "Automatic dollar rate saved."); }}>
            <div className="field" style={{ width: 200 }}>
              <label htmlFor="usd-adjust">Adjust market rate by (%)</label>
              <input id="usd-adjust" className="input" inputMode="decimal" value={adjust} onChange={(e) => setAdjust(e.target.value)} placeholder="0" />
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : usd.mode === "auto" ? "Save" : "Use automatic rate"}</button>
            <button type="button" className="btn btn-ghost" disabled={busy || usd.mode !== "auto"} onClick={() => void send({ type: "usd_refresh" }, "Rate refreshed.")}>Refresh now</button>
          </form>
          <p className="muted" style={{ fontSize: 13 }}>Use the adjustment to match the street rate, e.g. 3 means the market rate + 3%.</p>
        </>
      ) : (
        <form style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
          onSubmit={(e) => { e.preventDefault(); void send({ type: "usd", mode: "manual", nairaPerDollar: manual || 0 }, Number(manual) > 0 ? `Manual rate saved: ₦${Number(manual).toLocaleString("en-NG")} = US$1.` : "Dollar prices turned off."); }}>
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="usd-rate">Naira per US$1</label>
            <input id="usd-rate" className="input" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 1600 (0 = off)" />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save manual rate"}</button>
        </form>
      )}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
