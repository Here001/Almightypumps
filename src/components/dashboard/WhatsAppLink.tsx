"use client";

import { useEffect, useState } from "react";
import { api } from "../api";

type Status = { linked: { phone: string; since: string } | null; businessNumber: string | null; available: boolean };
type Code = { code: string; expiresAt: string; link: string };

/** Settings → WhatsApp: link this account to the customer's WhatsApp so the assistant can help with orders. */
export function WhatsAppLink() {
  const [s, setS] = useState<Status | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Status>("/api/me/whatsapp").then(setS).catch(() => setS(null));
  useEffect(() => { void load(); }, []);

  // While a code is showing, check every 5 s whether the customer has sent it.
  useEffect(() => {
    if (!code || s?.linked) return;
    const t = setInterval(() => { void api<Status>("/api/me/whatsapp").then((r) => { setS(r); if (r.linked) setCode(null); }).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [code, s?.linked]);

  async function act(action: "code" | "unlink") {
    setBusy(true); setErr(null);
    try {
      if (action === "code") setCode(await api<Code>("/api/me/whatsapp", { action }));
      else { await api("/api/me/whatsapp", { action }); setCode(null); await load(); }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!s || (!s.available && !s.linked)) return null;
  return (
    <section className="card glass" id="whatsapp">
      <h2>WhatsApp</h2>
      {s.linked ? (
        <>
          <p style={{ margin: 0 }}>Linked to <strong className="selectable">{s.linked.phone}</strong>. Chat with our assistant on WhatsApp to check your balance and orders, or buy airtime, data, Boost, gift cards and travel eSIMs. Nothing is bought until you reply YES.</p>
          <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {s.businessNumber && <a className="btn btn-primary" href={`https://wa.me/${s.businessNumber}`} target="_blank" rel="noopener noreferrer">Open WhatsApp chat</a>}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act("unlink")}>Unlink</button>
          </div>
        </>
      ) : code ? (
        <>
          <p style={{ margin: 0 }}>Send this message to us on WhatsApp from your phone. The code works for 15 minutes.</p>
          <div className="ap-code" aria-label="Your link message">LINK {code.code}</div>
          <a className="btn btn-primary" style={{ alignSelf: "flex-start" }} href={code.link} target="_blank" rel="noopener noreferrer">Open WhatsApp and send</a>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Waiting for your message… this page updates by itself.</p>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>Link your WhatsApp to chat with our assistant: check your balance and orders, and buy from your wallet right inside WhatsApp. Every purchase needs your YES.</p>
          <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void act("code")}>Link WhatsApp</button>
          {s.businessNumber && <p className="muted" style={{ fontSize: 13, margin: 0 }}>On your phone? You can also message us on WhatsApp with your account email and we&apos;ll email you a code to connect.</p>}
        </>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </section>
  );
}
