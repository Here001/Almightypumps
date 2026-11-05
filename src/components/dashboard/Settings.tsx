"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useThemePref, type ThemePref } from "../Theme";
import { useCurrency } from "./Currency";
import { ID_TYPES, NG_BANKS } from "@/core/banks";
import { ShopPhoto } from "./ShopPhoto";
import { PasswordInput } from "../PasswordInput";
import { IdentityCheck, NameChange, useIdentity } from "./IdentityCheck";

type Me = { name: string; email: string; phone: string | null; sellerStatus: string; isAdmin: boolean };
type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null);

export function Settings({ me, onOpenSellerPanel }: { me: Me; onOpenSellerPanel: () => void }) {
  const router = useRouter();
  return (
    <>
      <Profile me={me} />
      <IdentitySection />
      <Appearance />
      <Notifications />
      <Security />
      <Seller status={me.sellerStatus} onOpenPanel={onOpenSellerPanel} />
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

/** "Email me about my orders" (delivered, refunded, pending). */
function Notifications() {
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { api<{ notifyOrders: boolean }>("/api/me/settings").then((r) => setOn(r.notifyOrders)).catch(() => setOn(true)); }, []);
  async function toggle(v: boolean) {
    setOn(v); setMsg(null);
    try { await api("/api/me/settings", { type: "alerts", on: v }); setMsg({ ok: true, text: v ? "You'll get an email when your orders are delivered, refunded or pending." : "Order emails are off. You'll still see everything in your account." }); }
    catch (e) { setOn(!v); setMsg({ ok: false, text: (e as Error).message }); }
  }
  return (
    <section className="card glass">
      <h2>Email notifications</h2>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15 }}>
        <input type="checkbox" checked={on ?? true} disabled={on === null} onChange={(e) => void toggle(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
        <span>Email me about my orders<span className="muted" style={{ display: "block", fontSize: 13 }}>When an order is delivered, refunded or pending, and when a withdrawal is sent. Security emails (login codes) are always sent.</span></span>
      </label>
      <Note msg={msg} />
    </section>
  );
}

function IdentitySection() {
  const { data, reload } = useIdentity();
  return <IdentityCheck data={data} reload={reload} />;
}

function Profile({ me }: { me: Me }) {
  const router = useRouter();
  const { data: idData, reload } = useIdentity();
  const name = me.name;
  const [phone, setPhone] = useState(me.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const changed = phone.trim() !== (me.phone ?? "");
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
          <input id="st-name" className="input" value={name} readOnly aria-readonly="true" style={{ opacity: 0.7 }} />
          <NameChange data={idData} reload={() => { reload(); router.refresh(); }} /></div>
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
          <PasswordInput id="st-cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></div>
        <div className="field"><label htmlFor="st-new">New password</label>
          <PasswordInput id="st-new" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></div>
        <div className="field"><label htmlFor="st-conf">Type the new password again</label>
          <PasswordInput id="st-conf" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={mismatch} />
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

type SellerProfile = {
  businessName: string; contactPhone: string; bankName: string; bankCode: string; accountName: string;
  accountNumberMasked: string; idType: string; idNumberMasked: string; whatTheySell: string; reviewNote: string | null;
};

function Seller({ status, onOpenPanel }: { status: string; onOpenPanel: () => void }) {
  const router = useRouter();
  const [st, setSt] = useState(status);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ businessName: "", contactPhone: "", whatTheySell: "", bankCode: "", accountNumber: "", accountName: "", idType: "nin", idNumber: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    api<{ sellerStatus: string; profile: SellerProfile | null }>("/api/seller/apply").then((r) => {
      setSt(r.sellerStatus);
      setProfile(r.profile);
      if (r.profile) setF((x) => ({ ...x, businessName: r.profile!.businessName, contactPhone: r.profile!.contactPhone, whatTheySell: r.profile!.whatTheySell, bankCode: r.profile!.bankCode, accountName: r.profile!.accountName, idType: r.profile!.idType }));
    }).catch(() => {});
  }, []);

  const idType = ID_TYPES.find((t) => t.id === f.idType) ?? ID_TYPES[0];
  const showForm = st === "none" ? editing : st === "rejected" ? editing : false;

  return (
    <section className="card glass">
      <h2>Seller account</h2>
      {st === "verified" && (
        <>
          <div className="form-ok" role="status">You&apos;re a verified seller{profile ? ` as “${profile.businessName}”` : ""}. Post and manage your ads in the P2P tab.</div>
          <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={onOpenPanel}>Open my seller panel</button>
          <ShopPhoto name={profile?.businessName ?? "Shop"} />
          {profile && <p className="muted" style={{ fontSize: 13 }}>Payouts go to {profile.bankName} {profile.accountNumberMasked} ({profile.accountName}). Contact support to change it.</p>}
        </>
      )}
      {st === "pending" && (
        <>
          <div className="form-ok" role="status">Thanks! Your application is being reviewed. We check your ID and bank details, usually within 24 hours.</div>
          {profile && <p className="muted" style={{ fontSize: 13 }}>{profile.businessName} · {profile.bankName} {profile.accountNumberMasked} · ID {profile.idNumberMasked}</p>}
          {profile && <ShopPhoto name={profile.businessName} />}
        </>
      )}
      {st === "rejected" && !editing && (
        <>
          <div className="form-error" role="alert">Your application wasn&apos;t approved{profile?.reviewNote ? `: ${profile.reviewNote}` : "."}</div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>Fix and re-apply</button>
        </>
      )}
      {st === "none" && !editing && (
        <>
          <p className="muted" style={{ fontSize: 14 }}>Sell on the P2P marketplace. Buyers pay into escrow, you get paid when they confirm (7% fee). We verify every seller to keep buyers safe.</p>
          <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>Become a seller</button>
        </>
      )}
      {showForm && (
        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            const r = await api<{ sellerStatus: string }>("/api/seller/apply", f);
            setSt(r.sellerStatus);
            setEditing(false);
            const p = await api<{ profile: SellerProfile | null }>("/api/seller/apply");
            setProfile(p.profile);
            router.refresh();
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          } finally {
            setBusy(false);
          }
        }}>
          <h3 style={{ fontSize: 15 }}>About your shop</h3>
          <div className="field"><label htmlFor="sa-biz">Shop or business name</label>
            <input id="sa-biz" className="input" value={f.businessName} onChange={set("businessName")} required maxLength={80} /></div>
          <div className="field"><label htmlFor="sa-phone">Phone number</label>
            <input id="sa-phone" className="input" value={f.contactPhone} onChange={set("contactPhone")} inputMode="tel" placeholder="0803 123 4567" required /></div>
          <div className="field"><label htmlFor="sa-what">What will you sell?</label>
            <textarea id="sa-what" className="input" rows={2} value={f.whatTheySell} onChange={set("whatTheySell")} placeholder="e.g. Bags, e-books, design templates" required maxLength={500} /></div>

          <h3 style={{ fontSize: 15 }}>Where we pay you</h3>
          <div className="field"><label htmlFor="sa-bank">Bank</label>
            <select id="sa-bank" className="select" value={f.bankCode} onChange={set("bankCode")} required>
              <option value="">Choose your bank…</option>
              {NG_BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="sa-acct">Account number</label>
            <input id="sa-acct" className="input" value={f.accountNumber} onChange={set("accountNumber")} inputMode="numeric" maxLength={10} placeholder={profile ? `Re-enter (was ${profile.accountNumberMasked})` : "10 digits"} required /></div>
          <div className="field"><label htmlFor="sa-acctname">Account name</label>
            <input id="sa-acctname" className="input" value={f.accountName} onChange={set("accountName")} placeholder="As shown by your bank" required /></div>

          <h3 style={{ fontSize: 15 }}>Verify your identity</h3>
          <div className="field"><label htmlFor="sa-idtype">ID type</label>
            <select id="sa-idtype" className="select" value={f.idType} onChange={set("idType")}>
              {ID_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="sa-idnum">ID number <span className="muted">({idType.hint})</span></label>
            <input id="sa-idnum" className="input" value={f.idNumber} onChange={set("idNumber")} autoComplete="off" required /></div>
          <p className="muted" style={{ fontSize: 13 }}>Your ID number is only seen by our verification team and is used only to confirm who you are.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send application"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <Note msg={msg} />
        </form>
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
