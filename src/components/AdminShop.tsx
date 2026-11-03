"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";
import { SHOP_ICON_NAMES, SHOP_ICON_PATHS } from "./icons";

type Category = {
  id: string; slug: string; name: string; description: string; icon: string;
  showOnHub: boolean; active: boolean; products: number; liveProducts: number;
};
type Product = {
  id: string; publicId: number; name: string; description: string; price: number; delivery: "code" | "manual";
  askCustomer: string | null; stockLimit: number | null; active: boolean; availableCodes: number; sold: number;
};
type Order = {
  id: string; publicId: number; product: string; delivery: string; amount: number; status: string;
  customerInput: string | null; askCustomer: string | null; content: string | null; note: string | null;
  createdAt: string; customerName: string; customerEmail: string;
};

function Ico({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SHOP_ICON_PATHS[name] ?? SHOP_ICON_PATHS.bag} />
    </svg>
  );
}

type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null);

export function AdminShop() {
  const [view, setView] = useState<"catalogue" | "orders">("catalogue");
  return (
    <>
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Shop section">
        <button type="button" className="ap-chip" aria-pressed={view === "catalogue"} onClick={() => setView("catalogue")}>Categories & products</button>
        <button type="button" className="ap-chip" aria-pressed={view === "orders"} onClick={() => setView("orders")}>Orders to deliver</button>
      </div>
      {view === "catalogue" ? <Catalogue /> : <Orders />}
    </>
  );
}

/* ---------------- categories & products ---------------- */

function Catalogue() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickCat, setQuickCat] = useState("");
  const [editCat, setEditCat] = useState(false);
  const [notice, setNotice] = useState<Msg>(null);
  const [version, setVersion] = useState(0); // bumps to reload the product list after a quick add

  const load = useCallback(async () => {
    try {
      const c = await api<Category[]>("/api/admin/shop?view=categories");
      setCats(c);
      setSelected((s) => s ?? c[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = cats?.find((c) => c.id === selected) ?? null;
  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!cats) return <p className="muted" role="status">Loading…</p>;

  const pick = (id: string) => {
    setSelected(id);
    setEditCat(false);
    setTimeout(() => document.getElementById("shop-products")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <>
      {cats.length > 0 && (
        <section className="card glass">
          <h2>Add a product</h2>
          {!quickAdd ? (
            <>
              <p className="muted" style={{ fontSize: 14 }}>Add a product to any of your categories. It goes live straight away.</p>
              <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => { setNotice(null); setQuickCat(selected ?? cats[0].id); setQuickAdd(true); }}>+ Add product</button>
            </>
          ) : (
            <>
              <div className="field" style={{ maxWidth: 360 }}>
                <label htmlFor="quick-cat">Which category?</label>
                <select id="quick-cat" className="select" value={quickCat} onChange={(e) => setQuickCat(e.target.value)}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.products} product{c.products === 1 ? "" : "s"})</option>)}
                </select>
              </div>
              <ProductForm
                key={quickCat} categoryId={quickCat}
                onDone={async () => {
                  const name = cats.find((c) => c.id === quickCat)?.name ?? "the category";
                  setQuickAdd(false);
                  setNotice({ ok: true, text: `Product added to “${name}” and live.` });
                  setSelected(quickCat);
                  setVersion((v) => v + 1);
                  await load();
                }}
                onCancel={() => setQuickAdd(false)}
              />
            </>
          )}
          <Note msg={notice} />
        </section>
      )}

      <section className="card glass">
        <h2>Categories</h2>
        <p className="muted" style={{ fontSize: 14 }}>Tap a category to see and add its products. A category shows as a tile on the customer Services home once it has a live product.</p>
        {cats.length > 0 && (
          <div className="ap-platforms">
            {cats.map((c) => (
              <button key={c.id} type="button" className="ap-platform" aria-pressed={c.id === selected} onClick={() => pick(c.id)}>
                <span className="ap-mono" aria-hidden="true"><Ico name={c.icon} /></span>
                <span className="ap-platform-name">{c.name}</span>
                <span className="ap-platform-count">{c.liveProducts} live product{c.liveProducts === 1 ? "" : "s"}{!c.active ? " · hidden" : ""}</span>
              </button>
            ))}
          </div>
        )}
        <CategoryForm key="new" onSaved={async (c) => { await load(); pick(c.id); }} />
      </section>

      {current && (
        <>
          <div id="shop-products" style={{ scrollMarginTop: 12 }}>
            <Products key={`${current.id}-${version}`} category={current} onChanged={load} />
          </div>
          <section className="card glass">
            {editCat ? (
              <>
                <h2>Edit “{current.name}”</h2>
                <CategoryForm key={current.id} category={current} onSaved={load} />
                <button type="button" className="ap-link" onClick={() => setEditCat(false)}>Close</button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setEditCat(true)}>Edit category details (name, icon, visibility)</button>
            )}
          </section>
        </>
      )}
    </>
  );
}

function CategoryForm({ category, onSaved }: { category?: Category; onSaved: (c: Category) => void | Promise<void> }) {
  const [open, setOpen] = useState(Boolean(category));
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "bag");
  const [showOnHub, setShowOnHub] = useState(category?.showOnHub ?? true);
  const [active, setActive] = useState(category?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  if (!open) {
    return (
      <>
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => { setMsg(null); setOpen(true); }}>+ New category</button>
        <Note msg={msg} />
      </>
    );
  }

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const c = await api<Category>("/api/admin/shop", { type: "category", id: category?.id, name, description, icon, showOnHub, active });
          setMsg({ ok: true, text: category ? "Saved." : `Category “${c.name}” created. Now add products to it below.` });
          if (!category) { setName(""); setDescription(""); setOpen(false); }
          await onSaved(c);
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field"><label htmlFor={`cn-${category?.id ?? "new"}`}>Category name</label>
        <input id={`cn-${category?.id ?? "new"}`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. eSIMs" required /></div>
      <div className="field"><label htmlFor={`cd-${category?.id ?? "new"}`}>Short description (optional)</label>
        <input id={`cd-${category?.id ?? "new"}`} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Travel data in 150+ countries" /></div>
      <div className="field">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Icon</span>
        <div className="ap-qty-picks" style={{ flexWrap: "wrap" }}>
          {SHOP_ICON_NAMES.map((n) => (
            <button key={n} type="button" className="ap-chip" aria-pressed={icon === n} onClick={() => setIcon(n)} aria-label={n}><Ico name={n} /></button>
          ))}
        </div>
      </div>
      <label className="ap-toggle"><input type="checkbox" checked={showOnHub} onChange={(e) => setShowOnHub(e.target.checked)} /><span>Show as a tile on the customer Services home</span></label>
      {category && <label className="ap-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Category is open (untick to hide everything in it)</span></label>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : category ? "Save category" : "Create category"}</button>
        {!category && <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
      <Note msg={msg} />
    </form>
  );
}

function Products({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const [items, setItems] = useState<Product[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    setItems(await api<Product[]>(`/api/admin/shop?view=products&categoryId=${category.id}`));
  }, [category.id]);
  useEffect(() => { setItems(null); setAdding(false); void load(); }, [load]);

  const refresh = async () => { await load(); onChanged(); };

  return (
    <section className="card glass">
      <h2>Products in “{category.name}”</h2>
      {!items ? <p className="muted" role="status">Loading…</p> : items.length === 0 && !adding ? (
        <div className="empty">No products yet. Add the first one; it goes live straight away.</div>
      ) : null}
      {items?.map((p) => <ProductRow key={p.id} p={p} categoryId={category.id} onSaved={refresh} />)}
      {adding ? (
        <ProductForm categoryId={category.id} onDone={async () => { setAdding(false); await refresh(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>+ Add product</button>
      )}
    </section>
  );
}

function ProductRow({ p, categoryId, onSaved }: { p: Product; categoryId: string; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const stock = p.delivery === "code" ? `${p.availableCodes} code${p.availableCodes === 1 ? "" : "s"} left` : p.stockLimit === null ? "unlimited" : `${p.stockLimit} left`;
  const soldOut = p.delivery === "code" ? p.availableCodes === 0 : p.stockLimit === 0;

  async function toggleLive() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/shop", {
        type: "product", id: p.id, categoryId, name: p.name, description: p.description, price: p.price / 100,
        delivery: p.delivery, askCustomer: p.askCustomer, stockLimit: p.stockLimit, active: !p.active,
      });
      await onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (editing) return <ProductForm categoryId={categoryId} product={p} onDone={async () => { setEditing(false); await onSaved(); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="ap-row-title" style={{ fontWeight: 700 }}>{p.name}</div>
          <div className="ap-service-meta" style={{ marginTop: 6 }}>
            <span className="ap-tag">{p.delivery === "code" ? "Instant code" : "Manual delivery"}</span>
            <span className={`status ${p.active ? (soldOut ? "warn" : "ok") : ""}`}>{p.active ? (soldOut ? "Sold out" : "Live") : "Hidden"}</span>
            <span className="muted">{stock} · {p.sold} sold</span>
          </div>
        </div>
        <div className="ap-row-end">
          <strong>{naira(p.price)}</strong>
          <button type="button" role="switch" aria-checked={p.active} className="ap-switch" disabled={busy} onClick={() => void toggleLive()} aria-label={`${p.name}: ${p.active ? "live" : "hidden"}`}>
            <span className="ap-switch-track"><span className="ap-switch-dot" /></span>
            <span className="ap-switch-text">{p.active ? "On" : "Off"}</span>
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost ap-mini" onClick={() => setEditing(true)}>Edit</button>
        {p.delivery === "code" && <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCodesOpen((v) => !v)}>{codesOpen ? "Close" : "+ Add codes"}</button>}
      </div>
      {codesOpen && <AddCodes productId={p.id} onAdded={onSaved} />}
      <Note msg={msg} />
    </div>
  );
}

function AddCodes({ productId, onAdded }: { productId: string; onAdded: () => Promise<void> }) {
  const [codes, setCodes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const count = codes.split(/\r?\n/).filter((c) => c.trim()).length;
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg(null);
      try {
        const r = await api<{ added: number; duplicates: number }>("/api/admin/shop", { type: "codes", productId, codes });
        setMsg({ ok: true, text: `Added ${r.added} code${r.added === 1 ? "" : "s"}${r.duplicates ? ` (${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"} skipped)` : ""}.` });
        setCodes("");
        await onAdded();
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      } finally {
        setBusy(false);
      }
    }}>
      <label className="muted" style={{ fontSize: 13, fontWeight: 600 }} htmlFor={`codes-${productId}`}>Paste codes, one per line. Each buyer automatically gets the next one.</label>
      <textarea id={`codes-${productId}`} className="input" rows={5} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder={"XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"} style={{ fontFamily: "var(--mono)", fontSize: 13 }} />
      <button className="btn btn-primary ap-mini" style={{ alignSelf: "flex-start" }} disabled={busy || count === 0}>{busy ? "Adding…" : `Add ${count || ""} code${count === 1 ? "" : "s"}`}</button>
      <Note msg={msg} />
    </form>
  );
}

function ProductForm({ categoryId, product, onDone, onCancel }: { categoryId: string; product?: Product; onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price / 100) : "");
  const [delivery, setDelivery] = useState<"code" | "manual">(product?.delivery ?? "manual");
  const [ask, setAsk] = useState(product?.askCustomer ?? "");
  const [stock, setStock] = useState(product?.stockLimit != null ? String(product.stockLimit) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const idp = product?.id ?? "new";

  return (
    <form className="ap-subform" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg(null);
      try {
        await api("/api/admin/shop", {
          type: "product", id: product?.id, categoryId, name, description, price, delivery,
          askCustomer: ask.trim() || null, stockLimit: delivery === "manual" && stock.trim() !== "" ? stock : null, active: product?.active ?? true,
        });
        await onDone();
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      } finally {
        setBusy(false);
      }
    }}>
      <h3 style={{ fontSize: 16 }}>{product ? `Edit “${product.name}”` : "New product"}</h3>
      <div className="field"><label htmlFor={`pn-${idp}`}>Product name</label>
        <input id={`pn-${idp}`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UK eSIM · 5GB · 30 days" required /></div>
      <div className="field"><label htmlFor={`pd-${idp}`}>Description (optional)</label>
        <textarea id={`pd-${idp}`} className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the customer gets and how to use it" /></div>
      <div className="field" style={{ maxWidth: 220 }}><label htmlFor={`pp-${idp}`}>Price (₦)</label>
        <input id={`pp-${idp}`} className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 7500" required /></div>
      <div className="field">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>How is it delivered?</span>
        <div className="ap-chips ap-chips-wrap" role="group" aria-label="Delivery">
          <button type="button" className="ap-chip" aria-pressed={delivery === "code"} onClick={() => setDelivery("code")} disabled={Boolean(product)}>Instant code (you upload codes)</button>
          <button type="button" className="ap-chip" aria-pressed={delivery === "manual"} onClick={() => setDelivery("manual")} disabled={Boolean(product)}>Manual (you deliver each order)</button>
        </div>
      </div>
      <div className="field"><label htmlFor={`pa-${idp}`}>Ask the customer for (optional)</label>
        <input id={`pa-${idp}`} className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. Email to send your eSIM to" /></div>
      {delivery === "manual" && (
        <div className="field" style={{ maxWidth: 220 }}><label htmlFor={`ps-${idp}`}>How many can be sold (empty = unlimited)</label>
          <input id={`ps-${idp}`} className="input" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : product ? "Save product" : "Add product (goes live)"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <Note msg={msg} />
    </form>
  );
}

/* ---------------- orders ---------------- */

function Orders() {
  const [status, setStatus] = useState<"pending" | "delivered" | "refunded">("pending");
  const [items, setItems] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Msg>(null);

  useEffect(() => {
    setItems(null);
    api<Order[]>(`/api/admin/shop?view=orders&status=${status}`).then(setItems).catch((e) => setError((e as Error).message));
  }, [status]);

  async function settle(o: Order, action: "deliver" | "refund") {
    if (action === "refund" && !window.confirm(`Refund ${naira(o.amount)} to ${o.customerName}?`)) return;
    setBusy(o.id);
    setNotice(null);
    try {
      await api("/api/admin/shop", { type: "order", id: o.id, action, content: content[o.id] });
      setItems((prev) => prev?.filter((x) => x.id !== o.id) ?? null);
      setNotice({ ok: true, text: action === "deliver" ? `Order #S-${o.publicId} delivered. The customer can see it in their Orders.` : `Order #S-${o.publicId} refunded.` });
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card glass">
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Order status">
        {(["pending", "delivered", "refunded"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "pending" ? "Waiting for you" : s === "delivered" ? "Delivered" : "Refunded"}
          </button>
        ))}
      </div>
      <Note msg={notice} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {!items && !error && <p className="muted" role="status">Loading…</p>}
      {items && items.length === 0 && <div className="empty">{status === "pending" ? "No orders waiting. Instant-code orders deliver themselves." : "Nothing here yet."}</div>}
      <ul className="ap-list">
        {items?.map((o) => (
          <li key={o.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div className="ap-row-title" style={{ fontWeight: 700 }}>#S-{o.publicId} · {o.product}</div>
                <div className="muted ap-row-sub">{o.customerName} ({o.customerEmail}) · {new Date(o.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</div>
                {o.customerInput && <div className="ap-row-sub" style={{ marginTop: 4 }}><span className="muted">{o.askCustomer ?? "Customer says"}:</span> <b style={{ overflowWrap: "anywhere" }}>{o.customerInput}</b></div>}
                {o.content && <div className="ap-row-sub" style={{ marginTop: 4, overflowWrap: "anywhere" }}><span className="muted">Delivered:</span> {o.content}</div>}
              </div>
              <strong>{naira(o.amount)}</strong>
            </div>
            {o.status === "pending" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: "1 1 240px", minHeight: 40 }} aria-label="What the customer receives"
                  placeholder="What the customer receives (code, link, instructions)" value={content[o.id] ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, [o.id]: e.target.value }))} />
                <button type="button" className="btn btn-primary ap-mini" disabled={busy === o.id} onClick={() => void settle(o, "deliver")}>Mark delivered</button>
                <button type="button" className="btn btn-ghost ap-mini" disabled={busy === o.id} onClick={() => void settle(o, "refund")}>Refund</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
