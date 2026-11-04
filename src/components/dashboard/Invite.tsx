"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Copy } from "./instantUi";

type Friend = { id: string; name: string; joined: string; status: "pending" | "rewarded" | "void"; rewardKobo: number | null; spentKobo: number | null };
type Data = { enabled: boolean; bonusKobo: number; friendBonusKobo: number; minSpendKobo: number; code: string; link: string; earnedKobo: number; friends: Friend[] };

/** "Invite friends & earn": the customer's link, how it works, and the friends they invited. */
export function Invite() {
  const { charge } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Data>("/api/referrals").then(setData).catch((e) => setError((e as Error).message)); }, []);

  if (error) return <section className="card glass"><div className="form-error" role="alert">{error}</div></section>;
  if (!data) return <section className="card glass"><p className="muted" role="status">Loading…</p></section>;
  if (!data.enabled) return <section className="card glass"><div className="empty">Invite rewards open soon. Check back shortly.</div></section>;

  const message = `Join me on Almighty Pumps: eSIMs, gift cards, airtime, verification numbers and more from one Naira wallet.${data.friendBonusKobo > 0 ? ` Sign up with my link and get ${charge(data.friendBonusKobo)} after your first ${charge(data.minSpendKobo)} of orders.` : ""} ${data.link}`;
  const share = async () => {
    try { await navigator.share({ title: "Almighty Pumps", text: message }); } catch { /* cancelled or not supported */ }
  };
  const waiting = data.friends.filter((f) => f.status === "pending").length;

  return (
    <>
      <section className="card glass">
        <h2>Invite friends, earn {charge(data.bonusKobo)} each</h2>
        <ol className="muted" style={{ margin: "4px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
          <li>Share your link with friends.</li>
          <li>They sign up and spend {charge(data.minSpendKobo)} or more on orders.</li>
          <li>You get <b>{charge(data.bonusKobo)}</b>{data.friendBonusKobo > 0 && <> and they get <b>{charge(data.friendBonusKobo)}</b></>} in your wallets, automatically.</li>
        </ol>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="inv-link">Your invite link</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code id="inv-link" className="ap-code" style={{ flex: "1 1 220px" }}>{data.link}</code>
            <Copy text={data.link} label="Copy link" />
          </div>
          <span className="muted" style={{ fontSize: 13 }}>Your code: <b className="selectable">{data.code}</b></span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className="btn btn-ghost" onClick={() => void share()}>More ways to share</button>}
        </div>
      </section>

      <div className="tiles">
        <div className="tile glass"><div className="tile-label">You&apos;ve earned</div><div className="tile-num">{charge(data.earnedKobo)}</div></div>
        <div className="tile glass"><div className="tile-label">Friends joined</div><div className="tile-num">{data.friends.length}</div><div className="muted tile-sub">{waiting} still to order</div></div>
      </div>

      <section className="card glass">
        <h2>Your friends</h2>
        {data.friends.length === 0 ? <div className="empty">No one yet. Share your link to get started.</div> : (
          <ul className="vc-history">
            {data.friends.map((f) => (
              <li key={f.id}>
                <div><strong>{f.name}</strong> <span className="muted" style={{ fontSize: 13 }}>joined {new Date(f.joined).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {f.status === "rewarded" && <><span className="ap-tag ok">Bonus paid</span><span className="muted" style={{ fontSize: 13 }}>+{charge(f.rewardKobo ?? 0)}</span></>}
                  {f.status === "void" && <span className="ap-tag">Not eligible</span>}
                  {f.status === "pending" && (
                    <>
                      <span className="ap-tag">Waiting for their orders</span>
                      <span className="muted" style={{ fontSize: 13 }}>{charge(f.spentKobo ?? 0)} of {charge(data.minSpendKobo)}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Bonuses are for real new customers. Inviting yourself with another account isn&apos;t allowed, and those bonuses can be cancelled.</p>
      </section>
    </>
  );
}
