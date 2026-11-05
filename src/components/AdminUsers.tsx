"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, naira } from "./api";

type U = { id: string; name: string; email: string; phone: string | null; role: string; sellerStatus: string; verified: boolean; suspended: boolean; createdAt: string; available: number; held: number };
type Data = { users: U[]; hasMore: boolean; total: number; page: number };
const FILTERS = [["all", "Everyone"], ["admins", "Admins"], ["sellers", "Verified sellers"], ["suspended", "Suspended"], ["unverified", "Email not confirmed"]] as const;

/** Admin: searchable list of every customer. */
export function AdminUsers() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      api<Data>(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${page}`)
        .then((d) => { if (n === seq.current) { setData(d); setError(null); } })
        .catch((e) => { if (n === seq.current) setError((e as Error).message); });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, filter, page]);

  return (
    <section className="card glass">
      <input className="input" type="search" placeholder="Search name, email, phone or invite code" aria-label="Search users" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Show" style={{ marginTop: 10 }}>
        {FILTERS.map(([id, label]) => <button key={id} type="button" className="ap-chip" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0); }}>{label}</button>)}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data ? <p className="muted" role="status">Loading…</p> : (
        <>
          <p className="muted" style={{ fontSize: 13 }}>{data.total.toLocaleString("en-NG")} {data.total === 1 ? "account" : "accounts"}</p>
          {data.users.length === 0 ? <div className="empty">No one matches that.</div> : (
            <ul className="ap-list">
              {data.users.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="ap-row adm-user-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="ap-row-title" style={{ fontWeight: 700 }}>{u.name}</div>
                      <div className="muted ap-row-sub selectable">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                      <div className="ap-service-meta" style={{ marginTop: 4 }}>
                        {u.role === "admin" && <span className="status info">Admin</span>}
                        {u.sellerStatus === "verified" && <span className="status ok">Seller</span>}
                        {u.suspended && <span className="status bad">Suspended</span>}
                        {!u.verified && <span className="status warn">Email not confirmed</span>}
                        <span className="muted" style={{ fontSize: 12 }}>joined {new Date(u.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span>
                      </div>
                    </div>
                    <div className="ap-row-end"><strong>{naira(u.available)}</strong>{u.held > 0 && <span className="muted ap-row-sub">{naira(u.held)} held</span>}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {page > 0 && <button type="button" className="btn btn-ghost ap-mini" onClick={() => setPage(page - 1)}>← Newer</button>}
            {data.hasMore && <button type="button" className="btn btn-ghost ap-mini" onClick={() => setPage(page + 1)}>Older →</button>}
          </div>
        </>
      )}
    </section>
  );
}
