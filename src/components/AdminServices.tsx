"use client";

import { useEffect, useState } from "react";
import { api, naira } from "./api";

type Status = "on_sale" | "admin" | "policy" | "provider";
type Row = {
  id: number; name: string; providerName: string; providerServiceId: string; platform: string; kind: string;
  rateKobo: number; costKobo: number; min: number; max: number; refill: boolean; hiddenReason: Exclude<Status, "on_sale"> | null;
};
type Data = { services: Row[]; hasMore: boolean; counts: Record<Status, number>; platforms: string[] };

const STATUS: { id: Status; label: string; help: string; tone: string }[] = [
  { id: "on_sale", label: "On sale", help: "Customers can see and buy these.", tone: "ok" },
  { id: "admin", label: "Hidden by you", help: "You hid these. Unhide any time; syncing won't undo your choice.", tone: "warn" },
  { id: "provider", label: "No longer offered", help: "The provider dropped these or priced them at ₦0. They come back automatically if the provider lists them again.", tone: "" },
  { id: "policy", label: "Not allowed", help: "Fake reviews/ratings, contest or website votes and fake add-to-carts. Shown for your information; they can't be put on sale.", tone: "bad" },
];

export function AdminServices() {
  const [status, setStatus] = useState<Status>("on_sale");
  const [platform, setPlatform] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(offset: number) {
    const p = new URLSearchParams({ status });
    if (platform) p.set("platform", platform);
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
  }, [status, platform, search]);

  async function toggle(r: Row) {
    const hide = r.hiddenReason === null;
    setBusyId(r.id);
    setNotice(null);
    try {
      await api(`/api/admin/services/${r.id}`, { hidden: hide });
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setData((d) => d && {
        ...d,
        counts: { ...d.counts, on_sale: d.counts.on_sale + (hide ? -1 : 1), admin: d.counts.admin + (hide ? 1 : -1) },
      });
      setNotice(hide ? `Hidden: “${r.name}”. Find it under “Hidden by you”.` : `Back on sale: “${r.name}”.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const current = STATUS.find((s) => s.id === status)!;

  return (
    <section className="card glass">
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Status">
        {STATUS.map((s) => (
          <button key={s.id} type="button" className="ap-chip" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
            {s.label} <span>{data ? data.counts[s.id].toLocaleString("en-NG") : "…"}</span>
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
          <select id="sv-platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All platforms</option>
            {data?.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

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
                  <span className={`status ${st.tone}`}>{st.label}</span>
                </div>
                <div className="muted ap-row-sub" style={{ marginTop: 6 }}>
                  #{r.id} · {r.providerName} ID {r.providerServiceId} · {r.min.toLocaleString("en-NG")}–{r.max.toLocaleString("en-NG")}
                </div>
              </div>
              <div className="ap-row-end">
                <strong>{naira(r.rateKobo)}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> /1k</span></strong>
                <span className="muted ap-row-sub">cost {naira(r.costKobo)}</span>
                {canToggle && (
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busyId === r.id} onClick={() => void toggle(r)}>
                    {busyId === r.id ? "Saving…" : r.hiddenReason === null ? "Hide" : "Unhide"}
                  </button>
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
