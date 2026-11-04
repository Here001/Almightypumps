"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import type { Question } from "@/core/listingQuestions";
import { ShopPhoto } from "./ShopPhoto";
import { TradeRoom } from "./TradeRoom";
import { ESCROW_DEFAULTS } from "@/core/escrow";

type Listing = {
  id: string; title: string; description: string; category: string; deliveryType: string; price: number; stock: number;
  minQty: number; maxQty: number; status: "active" | "paused" | "pending" | "declined"; reviewNote: string | null; sold: number; openOrders: number;
  answers: Record<string, string>; images: string[];
};
export type P2PCategory = { slug: string; name: string; description: string; questions: Question[]; requiresReview: boolean };
type Order = {
  id: string; publicId: number; status: string; quantity: number; amount: number; youReceive: number; shipBy: string;
  inspectionEndsAt: string | null; deliveryProof: string | null; createdAt: string; title: string; deliveryType: string; buyerName: string;
};
type Msg = { ok: boolean; text: string } | null;

export const DELIVERY_LABELS: Record<string, string> = { physical: "Physical item (shipped or picked up)", digital: "Digital (code, file or link)", service: "A service" };
const STATUS: Record<Listing["status"], { label: string; tone: string }> = {
  active: { label: "Live", tone: "ok" }, paused: { label: "Paused", tone: "" }, pending: { label: "Waiting for review", tone: "info" }, declined: { label: "Declined", tone: "bad" },
};

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h}h ${m}m left` : `${m}m left`;
}

const Note = ({ msg }: { msg: Msg }) => (msg ? <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null);

export function SellerPanel() {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [form, setForm] = useState<{ listing?: Listing } | null>(null);
  const [notice, setNotice] = useState<Msg>(null);
  const [cats, setCats] = useState<P2PCategory[]>([]);
  const [room, setRoom] = useState<string | null>(null);
  useEffect(() => { api<P2PCategory[]>("/api/market/categories").then(setCats).catch(() => {}); }, []);
  const catName = (slug: string) => cats.find((c) => c.slug === slug)?.name ?? slug;

  const load = useCallback(async () => {
    const [l, o] = await Promise.all([api<Listing[]>("/api/seller/listings"), api<Order[]>("/api/seller/orders")]);
    setListings(l);
    setOrders(o);
  }, []);
  useEffect(() => { void load().catch(() => {}); }, [load]);

  const toFulfil = orders?.filter((o) => o.status === "PAID") ?? [];
  const waiting = orders?.filter((o) => o.status === "SHIPPED" || o.status === "DISPUTED") ?? [];
  const earned = orders?.filter((o) => o.status === "COMPLETED").reduce((s, o) => s + o.youReceive, 0) ?? 0;

  async function listingAction(l: Listing, action: "pause" | "resume" | "remove") {
    if (action === "remove" && !window.confirm(`Remove “${l.title}”? It disappears from the marketplace. Open orders carry on.`)) return;
    try {
      await api(`/api/seller/listings/${l.id}`, { action });
      setNotice({ ok: true, text: action === "pause" ? "Ad paused: buyers can't see it." : action === "resume" ? "Ad is live again." : "Ad removed." });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <>
      <section className="card glass">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2>Seller panel</h2>
          <button type="button" className="btn btn-primary ap-mini" onClick={() => { setNotice(null); setForm({}); }}>+ Post an ad</button>
        </div>
        <ShopPhoto name="Shop" compact />
        <div className="tiles">
          <div className="tile glass"><div className="tile-label">To deliver</div><div className="tile-num">{toFulfil.length}</div></div>
          <div className="tile glass"><div className="tile-label">Waiting for buyer</div><div className="tile-num">{waiting.length}</div></div>
          <div className="tile glass"><div className="tile-label">Earned</div><div className="tile-num">{money(earned)}</div><div className="muted tile-sub">after the 7% fee</div></div>
        </div>
        <Note msg={notice} />
      </section>

      {form && (
        <ListingForm
          listing={form.listing} categories={cats}
          onCancel={() => setForm(null)}
          onSaved={async (m) => { setForm(null); setNotice({ ok: true, text: m }); await load(); router.refresh(); }}
        />
      )}

      {toFulfil.length > 0 && (
        <section className="card glass">
          <h2>Orders to deliver</h2>
          <p className="muted" style={{ fontSize: 14 }}>The buyer&apos;s money is safe in escrow. Deliver before the deadline, then mark it delivered. You&apos;re paid when they confirm (or automatically after 48 hours).</p>
          <ul className="ap-list">{toFulfil.map((o) => <FulfilRow key={o.id} o={o} onRoom={() => setRoom(o.id)} onDone={async (m) => { setNotice(m); await load(); router.refresh(); }} />)}</ul>
        </section>
      )}

      <section className="card glass">
        <h2>My ads</h2>
        {!listings ? <p className="muted" role="status">Loading…</p> : listings.length === 0 ? (
          <div className="empty">No ads yet. Tap “+ Post an ad” to list your first item.</div>
        ) : (
          <ul className="ap-list">
            {listings.map((l) => (
              <li key={l.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ap-row-title" style={{ fontWeight: 700 }}>{l.title}</div>
                    <div className="ap-service-meta" style={{ marginTop: 6 }}>
                      <span className={`status ${STATUS[l.status].tone}`}>{STATUS[l.status].label}</span>
                      <span className="ap-tag">{catName(l.category)}</span>
                      <span className="muted">{l.stock} in stock · {l.sold} sold{l.openOrders ? ` · ${l.openOrders} open order${l.openOrders === 1 ? "" : "s"}` : ""}</span>
                    </div>
                  </div>
                  <strong>{money(l.price)}</strong>
                </div>
                {l.reviewNote && (l.status === "pending" || l.status === "declined") && <div className="muted ap-row-sub">{l.status === "declined" ? "Reason: " : ""}{l.reviewNote}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost ap-mini" onClick={() => { setNotice(null); setForm({ listing: l }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                  {l.status === "active" && <button type="button" className="btn btn-ghost ap-mini" onClick={() => void listingAction(l, "pause")}>Pause</button>}
                  {l.status === "paused" && <button type="button" className="btn btn-ghost ap-mini" onClick={() => void listingAction(l, "resume")}>Resume</button>}
                  <button type="button" className="btn btn-ghost ap-mini" onClick={() => void listingAction(l, "remove")}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {orders && orders.some((o) => o.status !== "PAID") && (
        <section className="card glass">
          <h2>Sales history</h2>
          <ul className="ap-list">
            {orders.filter((o) => o.status !== "PAID").map((o) => (
              <li key={o.id} className="ap-row">
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title">{o.title} × {o.quantity}</div>
                  <div className="muted ap-row-sub">#M-{o.publicId} · {o.buyerName}{o.status === "SHIPPED" && o.inspectionEndsAt ? ` · auto-paid in ${timeLeft(o.inspectionEndsAt)}` : ""}</div>
                </div>
                <div className="ap-row-end">
                  <strong>{charge(o.youReceive)}</strong>
                  <button type="button" className="ap-link" style={{ fontSize: 13 }} onClick={() => setRoom(o.id)}>Trade room</button>
                  <span className={`status ${o.status === "COMPLETED" ? "ok" : o.status === "DISPUTED" ? "warn" : o.status === "SHIPPED" ? "info" : "bad"}`}>
                    {{ SHIPPED: "Buyer inspecting", COMPLETED: "Paid to you", DISPUTED: "In dispute", CANCELLED: "Cancelled", REFUNDED: "Refunded" }[o.status] ?? o.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {room && <TradeRoom tradeId={room} onClose={() => setRoom(null)} onChanged={() => { void load(); router.refresh(); }} />}
    </>
  );
}

function FulfilRow({ o, onDone, onRoom }: { o: Order; onDone: (m: Msg) => Promise<void>; onRoom: () => void }) {
  const { charge } = useCurrency();
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "SHIP" | "CANCEL") {
    if (action === "CANCEL" && !window.confirm("Cancel this order? The buyer gets a full refund.")) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/market/trades/${o.id}/action`, action === "SHIP" ? { action, deliveryProof: proof.trim() } : { action });
      await onDone({ ok: true, text: action === "SHIP" ? `Order #M-${o.publicId} marked as delivered. The buyer has 48 hours to inspect.` : `Order #M-${o.publicId} cancelled and refunded.` });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdue = new Date(o.shipBy).getTime() < Date.now();
  return (
    <li className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ap-row-title" style={{ fontWeight: 700 }}>{o.title} × {o.quantity}</div>
          <div className="muted ap-row-sub">#M-{o.publicId} · for {o.buyerName} · <span style={overdue ? { color: "var(--warn)" } : undefined}>deliver within {timeLeft(o.shipBy)}</span></div>
        </div>
        <div className="ap-row-end"><strong>{charge(o.youReceive)}</strong><span className="muted ap-row-sub">you receive</span></div>
      </div>
      {!open ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary ap-mini" onClick={() => setOpen(true)}>Mark as delivered</button>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act("CANCEL")}>Can&apos;t deliver: cancel</button>
          <button type="button" className="btn btn-ghost ap-mini" onClick={onRoom}>Chat with buyer</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }} htmlFor={`proof-${o.id}`}>
            {o.deliveryType === "digital" ? "The code, file link or details the buyer receives" : "Proof of delivery (tracking number, rider name, pickup details)"}
          </label>
          <textarea id={`proof-${o.id}`} className="input" rows={3} value={proof} onChange={(e) => setProof(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary ap-mini" disabled={busy || proof.trim().length < 3} onClick={() => void act("SHIP")}>{busy ? "Saving…" : "Confirm delivered"}</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setOpen(false)}>Back</button>
          </div>
        </div>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </li>
  );
}

const MAX_PHOTOS = 6;
/** A photo on the ad form: `url` is the saved photo's address, or a preview when `data` (a new upload) is set. */
type Photo = { url: string; data?: string };

/** Shrink a photo in the browser (max 1280px, JPEG under ~450 KB) before uploading. */
async function shrinkPhoto(file: File): Promise<string> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55, 0.42]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 600_000) return d; }
    return c.toDataURL("image/jpeg", 0.3);
  } finally { URL.revokeObjectURL(src); }
}

/** After the ad is saved: delete removed photos, upload new ones, then put the chosen cover first. Returns an error message or null. */
async function savePhotos(listingId: string, before: string[], after: Photo[]): Promise<string | null> {
  const idOf = (url: string) => url.split("/").pop() ?? "";
  const path = `/api/seller/listings/${listingId}/images`;
  try {
    for (const url of before) if (!after.some((p) => p.url === url)) await api(path, { action: "remove", imageId: idOf(url) });
    let coverId: string | null = null;
    for (const [i, p] of after.entries()) {
      const id = p.data ? (await api<{ id: string }>(path, { action: "add", image: p.data })).id : idOf(p.url);
      if (i === 0) coverId = id;
    }
    if (coverId && (before[0] ? idOf(before[0]) : null) !== coverId) await api(path, { action: "cover", imageId: coverId });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function ListingForm({ listing, categories, onCancel, onSaved }: { listing?: Listing; categories: P2PCategory[]; onCancel: () => void; onSaved: (msg: string) => Promise<void> }) {
  const { charge } = useCurrency();
  const [answers, setAnswers] = useState<Record<string, string>>(listing?.answers ?? {});
  const [f, setF] = useState({
    title: listing?.title ?? "", description: listing?.description ?? "", category: listing?.category ?? "",
    deliveryType: listing?.deliveryType ?? "digital", price: listing ? String(listing.price / 100) : "",
    stock: String(listing?.stock ?? 1), minQty: String(listing?.minQty ?? 1), maxQty: String(listing?.maxQty ?? 1),
  });
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>(() => (listing?.images ?? []).map((url) => ({ url })));
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const priceKobo = Math.round(Number(f.price.replace(/,/g, "")) * 100);
  const cat = categories.find((c) => c.slug === f.category);
  const fee = Number.isFinite(priceKobo) && priceKobo > 0 ? Math.ceil((priceKobo * ESCROW_DEFAULTS.sellerFeeBps) / 10_000) : 0;

  return (
    <section className="card glass">
      <h2>{listing ? "Edit ad" : "Post an ad"}</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblems([]);
        try {
          const r = listing
            ? await api<{ id?: string; message: string }>(`/api/seller/listings/${listing.id}`, { action: "update", ...f, answers })
            : await api<{ id?: string; message: string }>("/api/market/listings", { ...f, answers });
          const id = listing?.id ?? r.id ?? "";
          const photoErr = await savePhotos(id, listing?.images ?? [], photos);
          await onSaved(photoErr ? `${r.message} Some photos weren't saved: ${photoErr}` : r.message);
        } catch (err) {
          setProblems([(err as Error).message]);
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field"><label htmlFor="lf-cat">Category</label>
          <select id="lf-cat" className="select" value={f.category} onChange={set("category")} required>
            <option value="">Choose a category…</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          {cat?.description && <span className="muted" style={{ fontSize: 12 }}>{cat.description}</span>}
          {cat?.requiresReview && <span className="muted" style={{ fontSize: 12 }}>Ads in this category are checked by our team before going live.</span>}
        </div>
        <div className="field"><label htmlFor="lf-title">Title</label>
          <input id="lf-title" className="input" value={f.title} onChange={set("title")} placeholder="Enter Product Title" required minLength={4} maxLength={120} /></div>
        <div className="field"><label htmlFor="lf-desc">Description</label>
          <textarea id="lf-desc" className="input" rows={4} value={f.description} onChange={set("description")} placeholder="Condition, what's included, how you deliver" required minLength={20} maxLength={4000} />
          <span className="muted" style={{ fontSize: 12 }}>{f.description.trim().length}/20 characters minimum</span></div>
        <div className="field">
          <span id="lf-photos-label" style={{ fontWeight: 600, fontSize: 14 }}>Photos <span className="muted">(optional, up to {MAX_PHOTOS})</span></span>
          <div className="ad-photos" role="group" aria-labelledby="lf-photos-label">
            {photos.map((p, i) => (
              <div key={p.url} className="ad-photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={p.url} alt={`Photo ${i + 1}`} />
                {i === 0 ? <span className="ad-photo-cover">Cover</span> : (
                  <button type="button" className="ad-photo-cover" onClick={() => setPhotos((ps) => [p, ...ps.filter((x) => x !== p)])}>Make cover</button>
                )}
                <button type="button" className="ad-photo-x" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}>×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="ad-photo-add">
                + Add<br />photo
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
                  e.target.value = "";
                  setPhotoMsg(null);
                  for (const file of files) {
                    try { const data = await shrinkPhoto(file); setPhotos((ps) => (ps.length < MAX_PHOTOS ? [...ps, { url: data, data }] : ps)); }
                    catch { setPhotoMsg("One of those files couldn't be read as a photo."); }
                  }
                }} />
              </label>
            )}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Clear photos of the real item sell faster. The first photo is the cover buyers see in the list.</span>
          {photoMsg && <span className="form-error" role="alert">{photoMsg}</span>}
        </div>
        {cat && cat.questions.length > 0 && (
          <div className="ap-subform" style={{ gap: 10 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>About this {cat.name.toLowerCase()} item</span>
            {cat.questions.map((q) => (
              <div key={q.id} className="field">
                <label htmlFor={`ans-${q.id}`}>{q.label}{!q.required && <span className="muted"> (optional)</span>}</label>
                {q.type === "textarea" ? (
                  <textarea id={`ans-${q.id}`} className="input" rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} required={q.required} />
                ) : q.type === "select" || q.type === "yesno" ? (
                  <select id={`ans-${q.id}`} className="select" value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} required={q.required}>
                    <option value="">Choose…</option>
                    {(q.type === "yesno" ? ["Yes", "No"] : q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={`ans-${q.id}`} className="input" inputMode={q.type === "number" ? "decimal" : undefined} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} required={q.required} />
                )}
                {q.help && <span className="muted" style={{ fontSize: 12 }}>{q.help}</span>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 220px" }}><label htmlFor="lf-del">How it&apos;s delivered</label>
            <select id="lf-del" className="select" value={f.deliveryType} onChange={set("deliveryType")}>
              {Object.entries(DELIVERY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 140px" }}><label htmlFor="lf-price">Price each (₦)</label>
            <input id="lf-price" className="input" inputMode="decimal" value={f.price} onChange={set("price")} required /></div>
          <div className="field" style={{ flex: "1 1 90px" }}><label htmlFor="lf-stock">In stock</label>
            <input id="lf-stock" className="input" inputMode="numeric" value={f.stock} onChange={set("stock")} required /></div>
          <div className="field" style={{ flex: "1 1 90px" }}><label htmlFor="lf-min">Min per order</label>
            <input id="lf-min" className="input" inputMode="numeric" value={f.minQty} onChange={set("minQty")} /></div>
          <div className="field" style={{ flex: "1 1 90px" }}><label htmlFor="lf-max">Max per order</label>
            <input id="lf-max" className="input" inputMode="numeric" value={f.maxQty} onChange={set("maxQty")} /></div>
        </div>
        {fee > 0 && <p className="muted" style={{ fontSize: 13 }}>For each sale you receive {charge(priceKobo - fee)} after our 7% escrow fee.</p>}
        <p className="muted" style={{ fontSize: 13 }}>Some ads are checked by our team before going live. Fake documents, counterfeits, accounts, weapons and drugs aren&apos;t allowed.</p>
        {problems.length > 0 && <div className="form-error" role="alert">{problems.join(" ")}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : listing ? "Save changes" : "Post ad"}</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
