"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useThemePref, type ThemePref } from "../Theme";
import { useCurrency } from "./Currency";

type Me = { name: string; email: string; phone: string | null; sellerStatus: string; isAdmin: boolean };
type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null);

export function Settings({ me }: { me: Me }) {
  const router = useRouter();
  return (
    <>
      <Profile me={me} />
      <Appearance />
      <Security />
      <Seller status={me.sellerStatus} />
      <ApiKeys />
      <section className="card glass">
        <h2>Account</h2>
        {me.isAdmin && <a href="/admin" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>Open admin panel</a>}
        <button
          type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}
          onClick={async () => { await api("/api/auth/logout", {}); router.push("/"); router.refresh(); }}
        >Log out</button>
        <p className="muted" style={{ fontSize: 13 }}>Need to change your email or close your account? Contact support and we&apos;ll help.</p>
      </section>
    </>
  );
}

function Profile({ me }: { me: Me }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const changed = name.trim() !== me.name || phone.trim() !== (me.phone ?? "");
  return (
    <section className="card glass">
      <h2>Profile</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/me/settings", { type: "profile", name, phone });
          setMsg({ ok: true, text: "Profile saved." });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field"><label htmlFor="st-name">Name</label>
          <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
        <div className="field"><label htmlFor="st-phone">Phone (optional)</label>
          <input id="st-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" /></div>
        <div className="field"><label htmlFor="st-email">Email</label>
          <input id="st-email" className="input" value={me.email} readOnly aria-readonly="true" style={{ opacity: 0.7 }} /></div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || !changed}>{busy ? "Saving…" : "Save profile"}</button>
        <Note msg={msg} />
      </form>
    </section>
  );
}

function Appearance() {
  const [theme, setTheme] = useThemePref();
  const { currency, setCurrency, canSwitch } = useCurrency();
  const options: { id: ThemePref; label: string }[] = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "system", label: "Match my phone" },
  ];
  return (
    <section className="card glass">
      <h2>Appearance</h2>
      <div className="field">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Theme</span>
        <div className="ap-chips ap-chips-wrap" role="group" aria-label="Theme">
          {options.map((o) => <button key={o.id} type="button" className="ap-chip" aria-pressed={theme === o.id} onClick={() => setTheme(o.id)}>{o.label}</button>)}
        </div>
      </div>
      <div className="field">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Show prices in</span>
        {canSwitch ? (
          <div className="ap-chips ap-chips-wrap" role="group" aria-label="Show prices in">
            <button type="button" className="ap-chip" aria-pressed={currency === "NGN"} onClick={() => setCurrency("NGN")}>Naira (₦)</button>
            <button type="button" className="ap-chip" aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")}>US Dollars ($)</button>
          </div>
        ) : <p className="muted" style={{ fontSize: 14 }}>Naira (₦). Dollar prices aren&apos;t available yet.</p>}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Saved on this device. You&apos;re always charged in Naira.</p>
    </section>
  );
}

function Security() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [msg2, setMsg2] = useState<Msg>(null);
  const mismatch = confirm.length > 0 && next !== confirm;
  return (
    <section className="card glass">
      <h2>Password & security</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) return;
        setBusy("pw");
        setMsg(null);
        try {
          await api("/api/me/settings", { type: "password", current, next });
          setMsg({ ok: true, text: "Password changed. You've been logged out on your other devices." });
          setCurrent(""); setNext(""); setConfirm("");
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(null);
        }
      }}>
        <div className="field"><label htmlFor="st-cur">Current password</label>
          <input id="st-cur" type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></div>
        <div className="field"><label htmlFor="st-new">New password</label>
          <input id="st-new" type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></div>
        <div className="field"><label htmlFor="st-conf">Type the new password again</label>
          <input id="st-conf" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={mismatch} />
          {mismatch && <span className="muted" style={{ fontSize: 13, color: "var(--warn)" }}>The two new passwords don&apos;t match.</span>}</div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy !== null || !current || next.length < 8 || next !== confirm}>{busy === "pw" ? "Changing…" : "Change password"}</button>
        <Note msg={msg} />
      </form>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="muted" style={{ fontSize: 14 }}>Lost a phone or used a shared computer? Log out everywhere except this device.</p>
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} disabled={busy !== null} onClick={async () => {
          if (!window.confirm("Log out of all other devices?")) return;
          setBusy("all");
          setMsg2(null);
          try {
            await api("/api/me/settings", { type: "logout_all" });
            setMsg2({ ok: true, text: "Done. Every other device has been logged out." });
          } catch (err) {
            setMsg2({ ok: false, text: (err as Error).message });
          } finally {
            setBusy(null);
          }
        }}>{busy === "all" ? "Logging out…" : "Log out of all other devices"}</button>
        <Note msg={msg2} />
      </div>
    </section>
  );
}

function Seller({ status }: { status: string }) {
  const router = useRouter();
  const [s, setS] = useState(status);
  const [busy, setBusy] = useState(false);
  const label: Record<string, string> = {
    none: "Sell on the P2P marketplace with escrow protection. Apply and our team will verify you.",
    pending: "Your seller application is being reviewed. We'll verify your ID and bank details.",
    verified: "You're a verified seller. You can post ads on the P2P marketplace.",
    rejected: "Your seller application wasn't approved. Contact support for details.",
  };
  return (
    <section className="card glass">
      <h2>Seller account</h2>
      <p className="muted" style={{ fontSize: 14 }}>{label[s] ?? s}</p>
      {s === "none" && (
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ sellerStatus: string }>("/api/seller/apply", {});
            setS(r.sellerStatus);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}>{busy ? "Applying…" : "Apply to become a seller"}</button>
      )}
    </section>
  );
}

type Key = { id: string; prefix: string; label: string; createdAt: string };

function ApiKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => api<Key[]>("/api/keys").then(setKeys).catch(() => setKeys([]));
  useEffect(() => { void load(); }, []);

  return (
    <section className="card glass">
      <h2>Reseller API</h2>
      <p className="muted" style={{ fontSize: 14 }}>Run your own panel or bot on top of ours. Use a key with our standard API at <b>/api/v2</b>; orders are paid from this wallet.</p>
      {created && (
        <div className="form-ok" role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>Your new key. Copy it now: it won&apos;t be shown again.</span>
          <div className="ap-code">{created}</div>
          <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={async () => { try { await navigator.clipboard.writeText(created); } catch { /* ignore */ } }}>Copy</button>
        </div>
      )}
      {keys && keys.length > 0 && (
        <ul className="ap-list">
          {keys.map((k) => (
            <li key={k.id} className="ap-row">
              <div><div className="ap-row-title">{k.label}</div><div className="muted ap-row-sub" style={{ fontFamily: "var(--mono)" }}>{k.prefix}…</div></div>
              <div className="ap-row-end">
                <button type="button" className="btn btn-ghost ap-mini" onClick={async () => {
                  if (!window.confirm(`Revoke “${k.label}”? Anything using it stops working immediately.`)) return;
                  try { await api(`/api/keys/${k.id}`, {}); setMsg({ ok: true, text: `Revoked “${k.label}”.` }); void load(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
                }}>Revoke</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ key: string }>("/api/keys", { label: label.trim() || "Default" });
          setCreated(r.key);
          setLabel("");
          void load();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="key-label">Name for a new key</label>
          <input id="key-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My panel" maxLength={40} /></div>
        <button className="btn btn-ghost" disabled={busy}>{busy ? "Creating…" : "Create key"}</button>
      </form>
      <Note msg={msg} />
    </section>
  );
}
