"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { PasswordInput } from "./PasswordInput";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const EMAIL_KEY = "ap_login_email";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile "I'm not a robot" check. Starts as soon as the page opens so it finishes while the
 * person types; the box only shows if Cloudflare needs a click ("interaction-only").
 */
function Captcha({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (t: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const mount = () => {
      if (cancelled || !box.current || id.current) return;
      if (!window.turnstile) {
        // The script tag below is loading; check again shortly (gives up after ~20s).
        if (++tries > 200) { setFailed(true); return; }
        setTimeout(mount, 100);
        return;
      }
      id.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        appearance: "interaction-only",
        "refresh-expired": "auto",
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        callback: (t: string) => { setFailed(false); onToken(t); },
        "expired-callback": () => onToken(""),
        "error-callback": () => { setFailed(true); onToken(""); },
      });
    };
    mount();
    return () => {
      cancelled = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  // After a failed attempt the old token is used up: get a new one.
  useEffect(() => {
    if (resetKey && id.current && window.turnstile) { window.turnstile.reset(id.current); onToken(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  return (
    <div className="captcha">
      {/* Hoisted to <head> by React and fetched straight away, in parallel with the page. */}
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <script src={SCRIPT} async />
      <div ref={box} />
      {failed && <span className="muted" style={{ fontSize: 13 }}>The robot check couldn&apos;t load. Check your connection and refresh the page.</span>}
    </div>
  );
}

export default function AuthForm({ mode, captchaSiteKey }: { mode: "signup" | "login"; captchaSiteKey?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [email, setEmail] = useState("");
  const [waiting, setWaiting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [remember, setRemember] = useState(false);
  const signup = mode === "signup";

  useEffect(() => {
    if (waiting && token) { setWaiting(false); formRef.current?.requestSubmit(); }
  }, [waiting, token]);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => { setWaiting(false); setError("The robot check is taking too long. If a box appeared, tick it, then try again."); }, 20000);
    return () => clearTimeout(t);
  }, [waiting]);

  // "Remember me" also remembers the email on this device (never the password).
  useEffect(() => {
    if (signup) return;
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* private mode */ }
  }, [signup]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Tapped Log in before the robot check finished: wait for it, then continue automatically.
    if (captchaSiteKey && !token) { setWaiting(true); return; }
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try {
      await api(signup ? "/api/auth/register" : "/api/auth/login", { ...f, ...(signup ? {} : { remember }), captcha: token || undefined });
      if (!signup) {
        try {
          if (remember) localStorage.setItem(EMAIL_KEY, String(f.email ?? "").trim().toLowerCase());
          else localStorage.removeItem(EMAIL_KEY);
        } catch { /* ignore */ }
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  }

  return (
    <main className="app-shell auth-wrap">
      <div className="app-bg" aria-hidden="true" />
      <form ref={formRef} className="auth-card glass" onSubmit={onSubmit} noValidate>
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
        {captchaSiteKey && <Captcha siteKey={captchaSiteKey} onToken={setToken} resetKey={resetKey} />}
        <button type="submit" className="btn btn-primary" disabled={busy || waiting}>
          {waiting ? "Checking you're human…" : busy ? "Please wait…" : signup ? "Create account" : "Log in"}
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
