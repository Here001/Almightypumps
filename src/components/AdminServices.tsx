"use client";

import { useEffect, useState } from "react";
import { api, naira } from "./api";

type Status = "all" | "on_sale" | "admin" | "policy" | "provider";
type Row = {
  id: number; name: string; providerName: string; providerServiceId: string; platform: string; kind: string;
  rateKobo: number; costKobo: number; min: number; max: number; refill: boolean; hiddenReason: "admin" | "policy" | "provider" | null;
  featured: boolean; providerRecommended: boolean;
};
type Data = { services: Row[]; hasMore: boolean; counts: Record<Exclude<Status, "all">, number>; platforms: string[]; kinds: string[]; bulk: { canHide: number; canShow: number } };

const STATUS: { id: Status; label: string; help: string; tone: string }[] = [
  { id: "all", label: "All", help: "Everything your providers offer. Use the switch to turn a service on or off.", tone: "" },
  { id: "on_sale", label: "On sale", help: "Customers can see and buy these.", tone: "ok" },
  { id: "admin", label: "Hidden by you", help: "You hid these. Unhide any time; syncing won't undo your choice.", tone: "warn" },
  { id: "provider", label: "No longer offered", help: "The provider dropped these or priced them at ₦0. They come back automatically if the provider lists them again.", tone: "" },
  { id: "policy", label: "Not allowed", help: "Fake reviews/ratings, contest or website votes and fake add-to-carts. Shown for your information; they can't be put on sale.", tone: "bad" },
];

export function AdminServices() {
  const [status, setStatus] = useState<Status>("all");
  const [platform, setPlatform] = useState("");
  const [kind, setKind] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(offset: number) {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (platform) p.set("platform", platform);
    if (kind) p.set("kind", kind);
    if (search.trim().length >= 2) p.set("q", search.trim());
    if (offset) p.set("offset", String(offset));
    setLoading(true);
    setError(null);
    try {
      const d = await api<Data>(`/api/admin/services?${p}`);
      setData(d);
      setRows((prev) => (offset ? [...prev, ...d.services] : d.services));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(0), search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, platform, kind, search]);

  async function toggle(r: Row) {
    const hide = r.hiddenReason === null;
    setBusyId(r.id);
    setNotice(null);
    try {
      await api(`/api/admin/services/${r.id}`, { hidden: hide });
      setRows((prev) => status === "all"
        ? prev.map((x) => (x.id === r.id ? { ...x, hiddenReason: hide ? "admin" : null } : x))
        : prev.filter((x) => x.id !== r.id));
      setData((d) => d && {
        ...d,
        counts: { ...d.counts, on_sale: d.counts.on_sale + (hide ? -1 : 1), admin: d.counts.admin + (hide ? 1 : -1) },
        bulk: { canHide: d.bulk.canHide + (hide ? -1 : 1), canShow: d.bulk.canShow + (hide ? 1 : -1) },
      });
      setNotice(hide ? `Turned off: “${r.name}”.` : `Turned on: “${r.name}”. Customers can buy it again.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function bulk(hide: boolean) {
    const n = hide ? data?.bulk.canHide ?? 0 : data?.bulk.canShow ?? 0;
    const what = [platform || null, kind || null, search.trim().length >= 2 ? `matching “${search.trim()}”` : null].filter(Boolean).join(" · ");
    if (!window.confirm(`${hide ? "Turn OFF" : "Turn ON"} ${n.toLocaleString("en-NG")} services (${what})?`)) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      const r = await api<{ changed: number }>("/api/admin/services/bulk", { hidden: hide, platform: platform || undefined, kind: kind || undefined, q: search.trim() || undefined });
      setNotice(`${hide ? "Turned off" : "Turned on"} ${r.changed.toLocaleString("en-NG")} services.`);
      await load(0);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function star(r: Row) {
    setBusyId(r.id);
    setNotice(null);
    try {
      await api(`/api/admin/services/${r.id}`, { featured: !r.featured });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, featured: !r.featured } : x)));
      setNotice(!r.featured ? `Recommended: “${r.name}” now shows first for customers.` : `No longer recommended by you: “${r.name}”.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const current = STATUS.find((s) => s.id === status)!;
  const total = data ? data.counts.on_sale + data.counts.admin + data.counts.policy + data.counts.provider : 0;
  const filtered = Boolean(platform || kind || search.trim().length >= 2);

  return (
    <section className="card glass">
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Status">
        {STATUS.map((s) => (
          <button key={s.id} type="button" className="ap-chip" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
            {s.label} <span>{data ? (s.id === "all" ? total : data.counts[s.id]).toLocaleString("en-NG") : "…"}</span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>{current.help}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label htmlFor="sv-search">Search</label>
          <input id="sv-search" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, platform or provider service ID" autoComplete="off" />
        </div>
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label htmlFor="sv-platform">Platform</label>
          <select id="sv-platform" className="select" value={platform} onChange={(e) => { setPlatform(e.target.value); setKind(""); }}>
            <option value="">All platforms</option>
            {data?.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {platform && (
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="sv-kind">Type</label>
            <select id="sv-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All types</option>
              {data?.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
      </div>

      {filtered && data && (data.bulk.canHide > 0 || data.bulk.canShow > 0) && (
        <div className="ap-bulk">
          <span className="muted" style={{ fontSize: 14 }}>Switch everything that matches at once:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.bulk.canHide > 0 && <button type="button" className="btn btn-ghost ap-mini" disabled={bulkBusy} onClick={() => void bulk(true)}>Turn off all {data.bulk.canHide.toLocaleString("en-NG")}</button>}
            {data.bulk.canShow > 0 && <button type="button" className="btn btn-ghost ap-mini" disabled={bulkBusy} onClick={() => void bulk(false)}>Turn on all {data.bulk.canShow.toLocaleString("en-NG")}</button>}
          </div>
        </div>
      )}

      {notice && <div className="form-ok" role="status">{notice}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="empty">Nothing here{search ? " for that search" : ""}.</div>}

      <ul className="ap-list">
        {rows.map((r) => {
          const st = STATUS.find((s) => s.id === (r.hiddenReason ?? "on_sale"))!;
          const canToggle = r.hiddenReason === null || r.hiddenReason === "admin";
          return (
            <li key={r.id} className="ap-row">
              <div style={{ minWidth: 0 }}>
                <div className="ap-row-title">{r.name}</div>
                <div className="ap-service-meta" style={{ marginTop: 6 }}>
                  <span className="ap-tag">{r.platform}</span>
                  <span className="ap-tag">{r.kind}</span>
                  {r.refill && <span className="ap-tag ok">Refill</span>}
                  {r.providerRecommended && <span className="ap-tag rec">Recommended by {r.providerName}</span>}
                  <span className={`status ${st.tone}`}>{st.label}</span>
                </div>
                <div className="muted ap-row-sub" style={{ marginTop: 6 }}>
                  #{r.id} · {r.providerName} ID {r.providerServiceId} · {r.min.toLocaleString("en-NG")}–{r.max.toLocaleString("en-NG")}
                </div>
              </div>
              <div className="ap-row-end">
                <strong>{naira(r.rateKobo)}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> /1k</span></strong>
                <span className="muted ap-row-sub">cost {naira(r.costKobo)}</span>
                {r.hiddenReason !== "policy" && (
                  <button type="button" className="ap-star" aria-pressed={r.featured} disabled={busyId === r.id} onClick={() => void star(r)}
                    aria-label={r.featured ? `Stop recommending ${r.name}` : `Recommend ${r.name}`}>
                    {r.featured ? "★ Recommended" : "☆ Recommend"}
                  </button>
                )}
                {canToggle ? (
                  <button
                    type="button" role="switch" aria-checked={r.hiddenReason === null} className="ap-switch"
                    aria-label={`${r.name}: ${r.hiddenReason === null ? "on sale" : "off"}`}
                    disabled={busyId === r.id} onClick={() => void toggle(r)}
                  >
                    <span className="ap-switch-track"><span className="ap-switch-dot" /></span>
                    <span className="ap-switch-text">{busyId === r.id ? "…" : r.hiddenReason === null ? "On" : "Off"}</span>
                  </button>
                ) : (
                  <span className="muted ap-row-sub">{r.hiddenReason === "policy" ? "Locked" : "Not offered"}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {loading && <p className="muted" role="status">Loading…</p>}
      {data?.hasMore && !loading && <button type="button" className="btn btn-ghost" onClick={() => void load(rows.length)}>Show more</button>}
    </section>
  );
}
