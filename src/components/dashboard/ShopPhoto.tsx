"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const SIZE = 320;

/** Crop the picture to a centred square and shrink it, so uploads stay small and fast. */
async function toSquare(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx || !side) throw new Error();
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    const webp = canvas.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    throw new Error("We couldn't read that picture. Try a JPG or PNG photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Seller's shop picture: shown next to the shop name on every ad in the marketplace. */
export function ShopPhoto({ name, compact = false }: { name: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { api<{ avatarUrl: string | null }>("/api/seller/avatar").then((r) => setUrl(r.avatarUrl)).catch(() => setUrl(null)); }, []);

  async function upload(file: File) {
    setMsg(null);
    if (!file.type.startsWith("image/")) return setMsg({ ok: false, text: "Choose a picture (JPG, PNG or WebP)." });
    if (file.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "That picture is over 15 MB. Choose a smaller one." });
    setBusy(true);
    try {
      const image = await toSquare(file);
      const r = await api<{ avatarUrl: string }>("/api/seller/avatar", { image });
      setUrl(r.avatarUrl);
      setMsg({ ok: true, text: "Shop picture saved. Buyers see it on your ads." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/seller/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove it. Try again.");
      setUrl(null);
      setMsg({ ok: true, text: "Shop picture removed." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className={`shop-photo${compact ? " compact" : ""}`}>
      <div className="shop-photo-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized avatar */}
        {url ? <img className="shop-photo-img" src={url} alt="Your shop picture" width={64} height={64} /> : <span className="shop-photo-img shop-photo-empty" aria-hidden="true">{initial}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Shop picture</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost ap-mini" disabled={busy || url === undefined} onClick={() => input.current?.click()}>
              {busy ? "Saving…" : url ? "Change picture" : "Upload picture"}
            </button>
            {url && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void remove()}>Remove</button>}
          </div>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
      {!compact && <p className="muted" style={{ fontSize: 12 }}>Square works best, like your logo. We crop it to a circle.</p>}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </div>
  );
}
