"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";

type Listing = {
  id: string; title: string; description: string; category: string; deliveryType: string; price: number; stock: number;
  minQty: number; maxQty: number; status: "active" | "paused" | "pending" | "declined"; reviewNote: string | null; sold: number; openOrders: number;
};
type Order = {
  id: string; publicId: number; status: string; quantity: number; amount: number; youReceive: number; shipBy: string;
  inspectionEndsAt: string | null; deliveryProof: string | null; createdAt: string; title: string; deliveryType: string; buyerName: string;
};
type Msg = { ok: boolean; text: string } | null;

export const CATEGORY_LABELS: Record<string, string> = {
  fashion: "Fashion", "phones-gadgets": "Phones & gadgets", beauty: "Beauty", home: "Home", "digital-products": "Digital products",
  "gift-cards-crypto": "Gift cards & crypto", services: "Services", other: "Other",
};
const DELIVERY_LABELS: Record<string, string> = { physical: "Physical item (shipped or picked up)", digital: "Digital (code, file or link)", service: "A service" };
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
        <div className="tiles">
          <div className="tile glass"><div className="tile-label">To deliver</div><div className="tile-num">{toFulfil.length}</div></div>
          <div className="tile glass"><div className="tile-label">Waiting for buyer</div><div className="tile-num">{waiting.length}</div></div>
          <div className="tile glass"><div className="tile-label">Earned</div><div className="tile-num">{money(earned)}</div><div className="muted tile-sub">after the 3% fee</div></div>
        </div>
        <Note msg={notice} />
      </section>

      {form && (
        <ListingForm
          listing={form.listing}
          onCancel={() => setForm(null)}
          onSaved={async (m) => { setForm(null); setNotice({ ok: true, text: m }); await load(); router.refresh(); }}
        />
      )}

      {toFulfil.length > 0 && (
        <section className="card glass">
          <h2>Orders to deliver</h2>
          <p className="muted" style={{ fontSize: 14 }}>The buyer&apos;s money is safe in escrow. Deliver before the deadline, then mark it delivered. You&apos;re paid when they confirm (or automatically after 48 hours).</p>
          <ul className="ap-list">{toFulfil.map((o) => <FulfilRow key={o.id} o={o} onDone={async (m) => { setNotice(m); await load(); router.refresh(); }} />)}</ul>
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
                      <span className="ap-tag">{CATEGORY_LABELS[l.category] ?? l.category}</span>
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
                  <span className={`status ${o.status === "COMPLETED" ? "ok" : o.status === "DISPUTED" ? "warn" : o.status === "SHIPPED" ? "info" : "bad"}`}>
                    {{ SHIPPED: "Buyer inspecting", COMPLETED: "Paid to you", DISPUTED: "In dispute", CANCELLED: "Cancelled", REFUNDED: "Refunded" }[o.status] ?? o.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function FulfilRow({ o, onDone }: { o: Order; onDone: (m: Msg) => Promise<void> }) {
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

function ListingForm({ listing, onCancel, onSaved }: { listing?: Listing; onCancel: () => void; onSaved: (msg: string) => Promise<void> }) {
  const { charge } = useCurrency();
  const [f, setF] = useState({
    title: listing?.title ?? "", description: listing?.description ?? "", category: listing?.category ?? "phones-gadgets",
    deliveryType: listing?.deliveryType ?? "physical", price: listing ? String(listing.price / 100) : "",
    stock: String(listing?.stock ?? 1), minQty: String(listing?.minQty ?? 1), maxQty: String(listing?.maxQty ?? 1),
  });
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const priceKobo = Math.round(Number(f.price.replace(/,/g, "")) * 100);
  const fee = Number.isFinite(priceKobo) && priceKobo > 0 ? Math.ceil(priceKobo * 0.03) : 0;

  return (
    <section className="card glass">
      <h2>{listing ? "Edit ad" : "Post an ad"}</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblems([]);
        try {
          const r = listing
            ? await api<{ message: string }>(`/api/seller/listings/${listing.id}`, { action: "update", ...f })
            : await api<{ message: string }>("/api/market/listings", f);
          await onSaved(r.message);
        } catch (err) {
          setProblems([(err as Error).message]);
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field"><label htmlFor="lf-title">Title</label>
          <input id="lf-title" className="input" value={f.title} onChange={set("title")} placeholder="e.g. iPhone 13, 128GB, UK used" required minLength={4} maxLength={120} /></div>
        <div className="field"><label htmlFor="lf-desc">Description</label>
          <textarea id="lf-desc" className="input" rows={4} value={f.description} onChange={set("description")} placeholder="Condition, what's included, how you deliver" required minLength={20} maxLength={4000} />
          <span className="muted" style={{ fontSize: 12 }}>{f.description.trim().length}/20 characters minimum</span></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 180px" }}><label htmlFor="lf-cat">Category</label>
            <select id="lf-cat" className="select" value={f.category} onChange={set("category")}>
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></div>
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
        {fee > 0 && <p className="muted" style={{ fontSize: 13 }}>For each sale you receive {charge(priceKobo - fee)} after our 3% escrow fee.</p>}
        <p className="muted" style={{ fontSize: 13 }}>Gift cards, crypto and some wording are checked by our team before going live. Fake documents, counterfeits, accounts, weapons and drugs aren&apos;t allowed.</p>
        {problems.length > 0 && <div className="form-error" role="alert">{problems.join(" ")}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : listing ? "Save changes" : "Post ad"}</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
