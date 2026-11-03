"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

export default function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(signup ? "/api/auth/register" : "/api/auth/login", Object.fromEntries(f.entries()));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
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
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        {signup && (
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" placeholder="0803 123 4567" />
          </div>
        )}
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1} required />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
        </button>
        <p className="muted" style={{ fontSize: 14 }}>
          {signup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New here? <Link href="/signup">Create an account</Link></>}
        </p>
      </form>
    </main>
  );
}
