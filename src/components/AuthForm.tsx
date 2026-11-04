"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { PasswordInput } from "./PasswordInput";

const EMAIL_KEY = "ap_login_email";

type Challenge = { needsCode: true; challenge: string; email: string; purpose: "signup" | "login" };
const isChallenge = (r: unknown): r is Challenge => Boolean(r && typeof r === "object" && (r as Challenge).needsCode);

/** Step 2: the 6-digit code we emailed. Fills itself from the keyboard suggestion on phones and submits at 6 digits. */
function CodeStep({ c, onChange, onBack, onDone }: { c: Challenge; onChange: (c: Challenge) => void; onBack: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(30);
  const input = useRef<HTMLInputElement>(null);
  const lastTried = useRef("");

  useEffect(() => { input.current?.focus(); }, [c.challenge]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    lastTried.current = value;
    setBusy(true); setError(null); setInfo(null);
    try {
      await api("/api/auth/verify", { challenge: c.challenge, code: value });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      input.current?.select();
    }
  }

  async function resend() {
    setError(null); setInfo(null);
    try {
      const n = await api<Challenge>("/api/auth/verify/resend", { challenge: c.challenge });
      onChange(n);
      setCode(""); lastTried.current = "";
      setWait(30);
      setInfo(`New code sent to ${n.email}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="auth-card glass" onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
      <Link href="/" className="logo" style={{ color: "var(--fg)" }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
      <h1>Check your email</h1>
      <p className="muted">
        {c.purpose === "signup" ? "To finish creating your account, enter" : "You're logging in on a new device. Enter"} the 6-digit code we sent to <b>{c.email}</b>.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {info && <div className="form-ok" role="status">{info}</div>}
      <div className="field">
        <label htmlFor="code">Code</label>
        <input
          ref={input} id="code" name="code" className="input auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          value={code} placeholder="••••••"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6 && v !== lastTried.current) void verify(v);
          }}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
      <p className="muted" style={{ fontSize: 13 }}>
        Not there? Check your spam or promotions folder.{" "}
        {wait > 0 ? <span>You can ask for a new code in {wait}s.</span> : <button type="button" className="ap-link" onClick={() => void resend()}>Send a new code</button>}
      </p>
      <p className="muted" style={{ fontSize: 13 }}><button type="button" className="ap-link" onClick={onBack}>← Use a different email</button></p>
    </form>
  );
}

export default function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const signup = mode === "signup";

  // "Remember me" also remembers the email on this device (never the password).
  useEffect(() => {
    if (signup) return;
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* private mode */ }
  }, [signup]);

  const finish = () => {
    router.push("/dashboard");
    router.refresh();
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try {
      const r = await api(signup ? "/api/auth/register" : "/api/auth/login", { ...f, ...(signup ? {} : { remember }) });
      if (!signup) {
        try {
          if (remember) localStorage.setItem(EMAIL_KEY, String(f.email ?? "").trim().toLowerCase());
          else localStorage.removeItem(EMAIL_KEY);
        } catch { /* ignore */ }
      }
      if (isChallenge(r)) { setChallenge(r); setBusy(false); return; }
      finish();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <main className="app-shell auth-wrap">
        <div className="app-bg" aria-hidden="true" />
        <CodeStep c={challenge} onChange={setChallenge} onBack={() => setChallenge(null)} onDone={finish} />
      </main>
    );
  }

  return (
    <main className="app-shell auth-wrap">
      <div className="app-bg" aria-hidden="true" />
      <form className="auth-card glass" onSubmit={onSubmit} noValidate>
        <Link href="/" className="logo" style={{ color: "var(--fg)" }}>
          <span className="logo-mark">AP</span>ALMIGHTY PUMPS
        </Link>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">{signup ? "Free to join. Fund your wallet in Naira when you're ready." : "Log in to your workspace and wallet."}</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        {signup && (
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete={signup ? "email" : "username"} inputMode="email" autoCapitalize="none" spellCheck={false} required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          {signup && <span className="muted" style={{ fontSize: 12 }}>We&apos;ll email you a 6-digit code to confirm it.</span>}
        </div>
        {signup && (
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" placeholder="0803 123 4567" />
          </div>
        )}
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1} maxLength={200} required />
          {signup && <span className="muted" style={{ fontSize: 12 }}>At least 8 characters. A short phrase is easiest to remember and hardest to guess.</span>}
        </div>
        {!signup && (
          <label className="ap-toggle">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me on this device</span>
          </label>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
        </button>
        {signup && <p className="muted" style={{ fontSize: 12 }}>By creating an account you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>}
        {!signup && <p className="muted" style={{ fontSize: 12 }}>Don&apos;t tick “Remember me” on a shared or public phone or computer.</p>}
        <p className="muted" style={{ fontSize: 14 }}>
          {signup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New here? <Link href="/signup">Create an account</Link></>}
        </p>
      </form>
    </main>
  );
}
