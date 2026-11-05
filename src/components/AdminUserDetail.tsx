"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Detail = {
  user: {
    id: string; name: string; email: string; phone: string | null; role: string; sellerStatus: string; shopName: string | null; verified: boolean;
    suspendedAt: string | null; suspendReason: string | null; createdAt: string; referralCode: string | null; inviter: { id: string; name: string; email: string } | null; apiKeys: number;
  };
  wallet: { available: number; held: number };
  totals: { deposited: number; spent: number; withdrawn: number; earned: number };
  counts: { boost: number; trades: number; packages: number; invited: number };
  activity: { id: string; kind: string; memo: string | null; change: number; heldChange: number; after: number; at: string }[];
  log: { id: string; action: string; detail: string | null; at: string; by: string }[];
};
const ACTION_LABEL: Record<string, string> = {
  suspend: "Suspended", unsuspend: "Unsuspended", logout: "Logged out of all devices", makeAdmin: "Made admin", removeAdmin: "Removed admin access",
  verifyEmail: "Confirmed email", profile: "Edited name/phone", wallet: "Wallet adjustment",
};
const whole = (k: number) => "₦" + Math.round(k / 100).toLocaleString("en-NG");
const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

/** Admin: one customer's account with actions. */
export function AdminUserDetail({ id, meId }: { id: string; meId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"" | "suspend" | "wallet" | "profile">("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [dir, setDir] = useState<"add" | "remove">("add");
  const [reqId, setReqId] = useState(uuid);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(() => api<Detail>(`/api/admin/users/${id}`).then((x) => { setD(x); setName(x.user.name); setPhone(x.user.phone ?? ""); }).catch((e) => setError((e as Error).message)), [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, ok: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/api/admin/users/${id}`, body);
      setMsg({ ok: true, text: ok }); setPanel(""); setReason(""); setAmount(""); setReqId(uuid());
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (error) return <><Link href="/admin/users" className="ap-link">← All users</Link><div className="form-error" role="alert">{error}</div></>;
  if (!d) return <p className="muted" role="status">Loading…</p>;
  const u = d.user;
  const self = u.id === meId;
  const kobo = Math.round(Number(amount.replace(/,/g, "")) * 100);

  return (
    <>
      <Link href="/admin/users" className="ap-link" style={{ alignSelf: "flex-start" }}>← All users</Link>
      <div>
        <h1 style={{ fontSize: 28 }}>{u.name}</h1>
        <p className="muted selectable" style={{ margin: 0 }}>{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
        <div className="ap-service-meta" style={{ marginTop: 8 }}>
          {u.role === "admin" && <span className="status info">Admin</span>}
          {u.sellerStatus === "verified" && <span className="status ok">Seller{u.shopName ? `: ${u.shopName}` : ""}</span>}
          {u.sellerStatus === "pending" && <span className="status warn">Seller application waiting</span>}
          {u.suspendedAt && <span className="status bad">Suspended</span>}
          <span className={`status ${u.verified ? "ok" : "warn"}`}>{u.verified ? "Email confirmed" : "Email not confirmed"}</span>
        </div>
      </div>
      {u.suspendedAt && <div className="form-error" role="status">Suspended {when(u.suspendedAt)}{u.suspendReason ? `: ${u.suspendReason}` : ""}. They can&apos;t log in or use the API.</div>}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}

      <div className="tiles">
        <div className="tile glass"><div className="tile-label">Wallet balance</div><div className="tile-num">{whole(d.wallet.available)}</div>{d.wallet.held > 0 && <div className="muted tile-sub">{naira(d.wallet.held)} held for orders</div>}</div>
        <div className="tile glass"><div className="tile-label">Topped up</div><div className="tile-num">{whole(d.totals.deposited)}</div></div>
        <div className="tile glass"><div className="tile-label">Spent on orders</div><div className="tile-num">{whole(d.totals.spent)}</div></div>
        <div className="tile glass"><div className="tile-label">Withdrawn</div><div className="tile-num">{whole(d.totals.withdrawn)}</div>{d.totals.earned > 0 && <div className="muted tile-sub">earned {naira(d.totals.earned)} (sales, trade-ins, invites)</div>}</div>
      </div>

      <section className="card glass">
        <h2>Actions</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setPanel(panel === "wallet" ? "" : "wallet")}>Add / remove money</button>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setPanel(panel === "profile" ? "" : "profile")}>Edit name / phone</button>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "logout" }, "Logged out of every device.", `Log ${u.name} out of every device?`)}>Log out everywhere</button>
          {!u.verified && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "verifyEmail" }, "Email marked as confirmed.")}>Mark email confirmed</button>}
          {u.role !== "admin" && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "makeAdmin" }, `${u.name} is now an admin.`, `Make ${u.name} an admin? They will see everything here, including money and customer details.`)}>Make admin</button>}
          {u.role === "admin" && !self && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "removeAdmin" }, "Admin access removed.", `Remove ${u.name}'s admin access?`)}>Remove admin</button>}
          {!self && (u.suspendedAt
            ? <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void act({ action: "unsuspend" }, "Account active again.")}>Unsuspend</button>
            : <button type="button" className="btn btn-ghost ap-mini adm-danger" disabled={busy} onClick={() => setPanel(panel === "suspend" ? "" : "suspend")}>Suspend</button>)}
        </div>

        {panel === "suspend" && (
          <div className="ap-subform" style={{ gap: 8, marginTop: 12 }}>
            <strong>Suspend {u.name}</strong>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>They&apos;re logged out at once and can&apos;t log in or use the API. Their money and orders stay as they are; pending orders still complete.</p>
            <input className="input" aria-label="Reason" placeholder="Reason (only admins see this)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary ap-mini" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "suspend", reason }, "Account suspended.")}>Suspend</button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setPanel("")}>Cancel</button>
            </div>
          </div>
        )}

        {panel === "wallet" && (
          <div className="ap-subform" style={{ gap: 8, marginTop: 12 }}>
            <strong>Adjust wallet</strong>
            <div className="ap-chips" role="group" aria-label="Add or remove">
              <button type="button" className="ap-chip" aria-pressed={dir === "add"} onClick={() => setDir("add")}>Add money</button>
              <button type="button" className="ap-chip" aria-pressed={dir === "remove"} onClick={() => setDir("remove")}>Remove money</button>
            </div>
            <div className="doc-row">
              <div className="field"><label htmlFor="adj-amt">Amount (₦)</label><input id="adj-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="adj-why">Reason (the customer sees this in their wallet history)</label><input id="adj-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dir === "add" ? "e.g. Refund for failed order #123" : "e.g. Reversal of duplicate top-up"} /></div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Use this only to fix mistakes. For refunds of normal orders, use the order&apos;s own page. {dir === "remove" ? "You can only remove money that's available (not held)." : ""}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary ap-mini" disabled={busy || !(kobo > 0) || reason.trim().length < 5}
                onClick={() => void act({ action: "wallet", direction: dir, amountKobo: kobo, reason, requestId: reqId }, `${dir === "add" ? "Added" : "Removed"} ${naira(kobo)}.`, `${dir === "add" ? "Add" : "Remove"} ${naira(kobo)} ${dir === "add" ? "to" : "from"} ${u.name}'s wallet?`)}>
                {dir === "add" ? "Add" : "Remove"} {kobo > 0 ? naira(kobo) : "money"}
              </button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setPanel("")}>Cancel</button>
            </div>
          </div>
        )}

        {panel === "profile" && (
          <div className="ap-subform" style={{ gap: 8, marginTop: 12 }}>
            <div className="doc-row">
              <div className="field"><label htmlFor="pf-name">Name</label><input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="field"><label htmlFor="pf-phone">Phone</label><input id="pf-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Email can&apos;t be changed here (it&apos;s how they log in). Passwords: ask them to use &ldquo;Forgot password&rdquo; on the login page.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void act({ action: "profile", name, phone }, "Saved.")}>Save</button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setPanel("")}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="card glass">
        <h2>Account</h2>
        <dl className="ap-facts">
          <dt>Joined</dt><dd>{when(u.createdAt)}</dd>
          <dt>Boost orders</dt><dd>{d.counts.boost}</dd>
          <dt>P2P trades</dt><dd>{d.counts.trades}</dd>
          <dt>Packages sent</dt><dd>{d.counts.packages}</dd>
          <dt>Friends invited</dt><dd>{d.counts.invited}{u.referralCode ? ` (code ${u.referralCode})` : ""}</dd>
          <dt>Invited by</dt><dd>{u.inviter ? <Link href={`/admin/users/${u.inviter.id}`}>{u.inviter.name}</Link> : "No one"}</dd>
          <dt>Reseller API keys</dt><dd>{u.apiKeys}</dd>
        </dl>
      </section>

      <section className="card glass">
        <h2>Wallet activity</h2>
        {d.activity.length === 0 ? <div className="empty">Nothing yet.</div> : (
          <ul className="ap-list">
            {d.activity.map((a) => (
              <li key={a.id} className="ap-row">
                <div style={{ minWidth: 0 }}><div className="ap-row-title">{a.memo ?? a.kind}</div><div className="muted ap-row-sub">{when(a.at)} · {a.kind}</div></div>
                <div className="ap-row-end">
                  <strong style={{ color: a.change > 0 ? "var(--ok)" : "var(--fg)" }}>{a.change === 0 ? (a.heldChange ? `${a.heldChange > 0 ? "+" : "−"}${naira(Math.abs(a.heldChange))} held` : "₦0.00") : `${a.change > 0 ? "+" : "−"}${naira(Math.abs(a.change))}`}</strong>
                  <span className="muted ap-row-sub">Balance {naira(a.after)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card glass">
        <h2>Admin history</h2>
        {d.log.length === 0 ? <div className="empty">No admin actions on this account yet.</div> : (
          <ul className="vc-admin-list">
            {d.log.map((l) => <li key={l.id}><div><strong>{ACTION_LABEL[l.action] ?? l.action}</strong>{l.detail && <span className="muted" style={{ fontSize: 13 }}>: {l.detail}</span>}</div><span className="muted" style={{ fontSize: 13 }}>{l.by} · {when(l.at)}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
