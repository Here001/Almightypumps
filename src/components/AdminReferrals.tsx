"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Config = { enabled: boolean; bonusKobo: number; friendBonusKobo: number; minSpendKobo: number; monthlyCap: number };
type Form = { enabled: boolean; bonusKobo: string; friendBonusKobo: string; minSpendKobo: string; monthlyCap: string };
type Person = { name: string; email: string };
type Row = { id: string; status: "pending" | "rewarded" | "void"; rewardKobo: number | null; friendRewardKobo: number | null; note: string | null; createdAt: string; rewardedAt: string | null; inviter: Person; friend: Person };
type Data = { config: Config; totals: { invited: number; rewarded: number; paidKobo: number }; top: { userId: string; name: string; email: string; invited: number; rewarded: number }[]; recent: Row[] };

const toNaira = (k: number) => String(k / 100);
const toKobo = (s: string) => Math.round((Number(s) || 0) * 100);
const STATUS = { pending: "Waiting for orders", rewarded: "Bonus paid", void: "Cancelled" } as const;

export function AdminReferrals() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<Data>("/api/admin/referrals");
      setData(d);
      setForm({ enabled: d.config.enabled, bonusKobo: toNaira(d.config.bonusKobo), friendBonusKobo: toNaira(d.config.friendBonusKobo), minSpendKobo: toNaira(d.config.minSpendKobo), monthlyCap: String(d.config.monthlyCap) });
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: unknown, ok: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/referrals", body); setMsg({ ok: true, text: ok }); setVoiding(null); setReason(""); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data || !form) return <p className="muted" role="status">Loading…</p>;
  const save = (enabled = form.enabled) => act({ action: "config", config: { enabled, bonusKobo: toKobo(form.bonusKobo), friendBonusKobo: toKobo(form.friendBonusKobo), minSpendKobo: toKobo(form.minSpendKobo), monthlyCap: Math.round(Number(form.monthlyCap) || 0) } }, enabled === form.enabled ? "Saved." : enabled ? "Invite rewards are ON." : "Invite rewards are OFF.");

  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}

      <section className="card glass">
        <div className="ap-list-head">
          <h2>Rewards</h2>
          <span className={`ap-tag${form.enabled ? " ok" : ""}`}>{form.enabled ? "ON: customers see “Invite Friends & Earn”" : "OFF"}</span>
        </div>
        <div className="form-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 8 }}>
          <div className="field"><label htmlFor="rf-bonus">Inviter gets (₦)</label><input id="rf-bonus" className="input" inputMode="decimal" value={form.bonusKobo} onChange={(e) => setForm({ ...form, bonusKobo: e.target.value })} /></div>
          <div className="field"><label htmlFor="rf-friend">New friend gets (₦)</label><input id="rf-friend" className="input" inputMode="decimal" value={form.friendBonusKobo} onChange={(e) => setForm({ ...form, friendBonusKobo: e.target.value })} /><span className="muted" style={{ fontSize: 12 }}>0 = only the inviter is paid</span></div>
          <div className="field"><label htmlFor="rf-min">Friend must first spend (₦)</label><input id="rf-min" className="input" inputMode="decimal" value={form.minSpendKobo} onChange={(e) => setForm({ ...form, minSpendKobo: e.target.value })} /><span className="muted" style={{ fontSize: 12 }}>On paid orders. Top-ups alone don&apos;t count.</span></div>
          <div className="field"><label htmlFor="rf-cap">Max paid invites per customer per 30 days</label><input id="rf-cap" className="input" inputMode="numeric" value={form.monthlyCap} onChange={(e) => setForm({ ...form, monthlyCap: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(!form.enabled)}>{form.enabled ? "Turn off" : "Save & turn on"}</button>
          {form.enabled && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: "pay" }, "Checked. Any bonuses that were due are paid.")}>Pay due bonuses now</button>}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Bonuses are paid automatically within 5 minutes of the friend reaching the minimum spend (their email must be confirmed). Keep the bonuses well below your profit on that spend.</p>
      </section>

      <div className="tiles">
        <div className="tile glass"><div className="tile-label">Friends invited</div><div className="tile-num">{data.totals.invited}</div></div>
        <div className="tile glass"><div className="tile-label">Bonuses paid</div><div className="tile-num">{data.totals.rewarded}</div></div>
        <div className="tile glass"><div className="tile-label">Total paid out</div><div className="tile-num">{naira(data.totals.paidKobo)}</div></div>
      </div>

      {data.top.length > 0 && (
        <section className="card glass">
          <h2>Top inviters</h2>
          <ul className="vc-admin-list">
            {data.top.map((t) => (
              <li key={t.userId}><div><strong>{t.name}</strong> <span className="muted" style={{ fontSize: 13 }}>{t.email}</span></div><span className="muted">{t.invited} invited · {t.rewarded} paid</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card glass">
        <h2>Recent invites</h2>
        {data.recent.length === 0 ? <div className="empty">No invites yet.</div> : (
          <ul className="vc-admin-list">
            {data.recent.map((r) => (
              <li key={r.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div><strong>{r.inviter.name}</strong> <span className="muted" style={{ fontSize: 13 }}>({r.inviter.email})</span> invited <strong>{r.friend.name}</strong> <span className="muted" style={{ fontSize: 13 }}>({r.friend.email}) · {new Date(r.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ap-tag${r.status === "rewarded" ? " ok" : ""}`}>{STATUS[r.status]}</span>
                  {r.status === "rewarded" && <span className="muted" style={{ fontSize: 13 }}>{naira(r.rewardKobo ?? 0)} + {naira(r.friendRewardKobo ?? 0)}</span>}
                  {r.note && <span className="muted" style={{ fontSize: 13 }}>{r.note}</span>}
                  {r.status === "pending" && voiding !== r.id && <button type="button" className="btn btn-ghost ap-mini" onClick={() => { setVoiding(r.id); setReason(""); }}>Cancel bonus</button>}
                </div>
                {voiding === r.id && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input className="input" style={{ flex: "1 1 220px" }} aria-label="Why cancel" placeholder="Why? e.g. same person, two accounts" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" className="btn btn-primary ap-mini" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "void", id: r.id, note: reason }, "Bonus cancelled.")}>Cancel bonus</button>
                    <button type="button" className="btn btn-ghost ap-mini" onClick={() => setVoiding(null)}>Back</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
