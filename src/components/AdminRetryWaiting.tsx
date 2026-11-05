"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

/** "Retry all now": re-send every order waiting for a supplier top-up. */
export function AdminRetryWaiting() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ sent: number; stillWaiting: number }>("/api/admin/retry-waiting", {});
      setMsg({ ok: r.stillWaiting === 0, text: r.stillWaiting === 0 ? "Done: every waiting order has been sent." : `${r.stillWaiting} order${r.stillWaiting === 1 ? " is" : "s are"} still waiting. Check the supplier balance has arrived, then try again.` });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{busy ? "Retrying…" : "I've topped up: retry all now"}</button></div>
      <span className="muted" style={{ fontSize: 13 }}>Customers&apos; money stays on hold until these are sent; nothing is refunded automatically. They&apos;re also retried automatically every few minutes.</span>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
    </div>
  );
}
