"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { PasswordInput } from "./PasswordInput";

type Challenge = { challenge: string; email: string };

/** Forgot password: email → 6-digit code + new password → signed in. */
export function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [c, setC] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    try { const saved = localStorage.getItem("ap_login_email"); if (saved) setEmail(saved); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      setC(await api<Challenge>("/api/auth/forgot", { email }));
      setWait(30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      await api("/api/auth/reset", { challenge: c.challenge, code, password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function resend() {
    if (!c) return;
    setError(null); setInfo(null);
    try {
      const n = await api<Challenge>("/api/auth/verify/resend", { challenge: c.challenge });
      setC(n); setCode(""); setWait(30);
      setInfo(`New code sent to ${n.email}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="app-shell auth-wrap">
      <div className="app-bg" aria-hidden="true" />
      {!c ? (
        <form className="auth-card glass" onSubmit={send} noValidate>
          <Link href="/" className="logo" style={{ color: "var(--fg)" }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
          <h1>Forgot your password?</h1>
          <p className="muted">Enter your account email. We&apos;ll send you a 6-digit code to set a new password.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" className="input" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Send code"}</button>
          <p className="muted" style={{ fontSize: 14 }}>Remembered it? <Link href="/login">Log in</Link></p>
        </form>
      ) : (
        <form className="auth-card glass" onSubmit={reset} noValidate>
          <Link href="/" className="logo" style={{ color: "var(--fg)" }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
          <h1>Set a new password</h1>
          <p className="muted">If <b>{email}</b> has an account, we sent a 6-digit code to it. Enter the code and choose a new password.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          {info && <div className="form-ok" role="status">{info}</div>}
          <div className="field">
            <label htmlFor="code">Code</label>
            <input id="code" className="input auth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
          <div className="field">
            <label htmlFor="password">New password</label>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} maxLength={200} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="muted" style={{ fontSize: 12 }}>At least 8 characters. You&apos;ll be logged out on your other devices.</span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6 || password.length < 8}>{busy ? "Saving…" : "Save new password"}</button>
          <p className="muted" style={{ fontSize: 13 }}>
            Not there? Check spam.{" "}
            {wait > 0 ? <span>New code in {wait}s.</span> : <button type="button" className="ap-link" onClick={() => void resend()}>Send a new code</button>}
          </p>
          <p className="muted" style={{ fontSize: 13 }}><button type="button" className="ap-link" onClick={() => { setC(null); setCode(""); setError(null); }}>← Use a different email</button></p>
        </form>
      )}
    </main>
  );
}
