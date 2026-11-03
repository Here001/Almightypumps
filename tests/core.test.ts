import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { nairaToKobo, formatNaira, feeBps, proportion, MoneyError } from "../src/core/money.ts";
import { credit, debit, hold, capture, release, settleHold, LedgerError } from "../src/core/ledger.ts";
import { transition, payoutSplit, shipDeadline, EscrowError, type TradeSnapshot } from "../src/core/escrow.ts";
import {
  sellRatePer1000, orderCost, settleOrder, mapProviderStatus, parseServices, parseAdd,
  parseMultiStatus, validateQuantity,
} from "../src/core/smm.ts";
import { checkListing } from "../src/core/listingPolicy.ts";
import { verifyFlutterwaveWebhook, generateApiKey, hashApiKey, paymentReference } from "../src/core/crypto.ts";

/* ---------------- money ---------------- */
test("nairaToKobo parses what people type", () => {
  assert.equal(nairaToKobo("1500"), 150_000);
  assert.equal(nairaToKobo("₦1,250.5"), 125_050);
  assert.equal(nairaToKobo("0.01"), 1);
  assert.equal(nairaToKobo(41000), 4_100_000);
  assert.throws(() => nairaToKobo("12.345"), MoneyError);
  assert.throws(() => nairaToKobo("-5"), MoneyError);
  assert.throws(() => nairaToKobo("abc"), MoneyError);
});

test("formatNaira groups thousands", () => {
  assert.equal(formatNaira(3_100_000), "₦31,000.00");
  assert.equal(formatNaira(5), "₦0.05");
  assert.equal(formatNaira(123_456_789), "₦1,234,567.89");
});

test("fees round down and proportions are exact", () => {
  assert.equal(feeBps(3_100_000, 300), 93_000);
  assert.equal(feeBps(333, 300), 9);
  assert.equal(proportion(1000, 1, 3), 333);
  assert.throws(() => proportion(1000, 4, 3), MoneyError);
});

/* ---------------- ledger ---------------- */
test("hold, capture and release keep totals consistent", () => {
  let s = { available: 0, held: 0 };
  s = credit(s, 10_000);
  s = hold(s, 7_000);
  assert.deepEqual(s, { available: 3_000, held: 7_000 });
  s = capture(s, 4_000);
  s = release(s, 3_000);
  assert.deepEqual(s, { available: 6_000, held: 0 });
});

test("cannot spend or hold more than available", () => {
  assert.throws(() => debit({ available: 100, held: 0 }, 101), (e: unknown) => e instanceof LedgerError && e.code === "INSUFFICIENT_FUNDS");
  assert.throws(() => hold({ available: 100, held: 0 }, 101), LedgerError);
  assert.throws(() => capture({ available: 0, held: 50 }, 51), LedgerError);
  assert.throws(() => credit({ available: 0, held: 0 }, 0), MoneyError);
  assert.throws(() => credit({ available: 0, held: 0 }, 1.5), MoneyError);
});

test("settleHold splits remaining and refuses double settlement", () => {
  assert.deepEqual(settleHold({ amount: 1000, settled: 0 }, 640), { capture: 640, release: 360 });
  assert.throws(() => settleHold({ amount: 1000, settled: 1000 }, 0), LedgerError);
  assert.throws(() => settleHold({ amount: 1000, settled: 0 }, 1001), LedgerError);
});

/* ---------------- escrow ---------------- */
const t0 = new Date("2026-11-01T12:00:00Z");
const paid: TradeSnapshot = { status: "PAID", shipBy: shipDeadline(t0), inspectionEndsAt: null };

test("happy path: ship then confirm pays the seller", () => {
  const shipped = transition(paid, "SHIP", "seller", new Date("2026-11-02T12:00:00Z"));
  assert.equal(shipped.status, "SHIPPED");
  assert.equal(shipped.patch.inspectionEndsAt?.toISOString(), "2026-11-04T12:00:00.000Z");
  const done = transition({ ...paid, status: "SHIPPED", inspectionEndsAt: shipped.patch.inspectionEndsAt! }, "CONFIRM", "buyer", new Date("2026-11-03T12:00:00Z"));
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.effect, "PAYOUT_SELLER");
});

test("only the right person can act", () => {
  assert.throws(() => transition(paid, "SHIP", "buyer", t0), EscrowError);
  assert.throws(() => transition({ ...paid, status: "SHIPPED" }, "CONFIRM", "seller", t0), EscrowError);
  assert.throws(() => transition({ ...paid, status: "DISPUTED" }, "RESOLVE_BUYER", "seller", t0), EscrowError);
});

test("buyer can cancel only after the ship deadline; seller any time before shipping", () => {
  assert.throws(() => transition(paid, "CANCEL", "buyer", new Date("2026-11-02T00:00:00Z")), EscrowError);
  assert.equal(transition(paid, "CANCEL", "buyer", new Date("2026-11-04T13:00:00Z")).effect, "REFUND_BUYER");
  assert.equal(transition(paid, "CANCEL", "seller", t0).status, "CANCELLED");
});

test("timers: auto-release after inspection, auto-cancel after ship deadline", () => {
  const shipped: TradeSnapshot = { status: "SHIPPED", shipBy: paid.shipBy, inspectionEndsAt: new Date("2026-11-04T12:00:00Z") };
  assert.throws(() => transition(shipped, "AUTO_RELEASE", "system", new Date("2026-11-04T11:00:00Z")), EscrowError);
  assert.equal(transition(shipped, "AUTO_RELEASE", "system", new Date("2026-11-04T12:00:01Z")).effect, "PAYOUT_SELLER");
  assert.throws(() => transition(paid, "AUTO_CANCEL", "system", new Date("2026-11-03T00:00:00Z")), EscrowError);
  assert.equal(transition(paid, "AUTO_CANCEL", "system", new Date("2026-11-04T12:00:01Z")).status, "CANCELLED");
});

test("disputes freeze funds until the dispute team decides", () => {
  const shipped: TradeSnapshot = { status: "SHIPPED", shipBy: paid.shipBy, inspectionEndsAt: new Date("2026-11-04T12:00:00Z") };
  const d = transition(shipped, "DISPUTE", "buyer", new Date("2026-11-03T12:00:00Z"));
  assert.equal(d.status, "DISPUTED");
  assert.equal(d.effect, "NONE");
  assert.throws(() => transition(shipped, "DISPUTE", "buyer", new Date("2026-11-05T00:00:00Z")), EscrowError);
  const disputed: TradeSnapshot = { ...shipped, status: "DISPUTED" };
  assert.throws(() => transition(disputed, "AUTO_RELEASE", "system", new Date("2026-11-10T00:00:00Z")), EscrowError);
  assert.equal(transition(disputed, "RESOLVE_BUYER", "admin", t0).status, "REFUNDED");
  assert.equal(transition(disputed, "RESOLVE_SELLER", "admin", t0).effect, "PAYOUT_SELLER");
});

test("closed trades accept no further actions", () => {
  for (const status of ["COMPLETED", "CANCELLED", "REFUNDED"] as const) {
    assert.throws(() => transition({ ...paid, status }, "RESOLVE_BUYER", "admin", t0), EscrowError);
  }
});

test("payout split takes the seller fee", () => {
  assert.deepEqual(payoutSplit(3_100_000), { seller: 3_007_000, fee: 93_000 });
  assert.deepEqual(payoutSplit(3_100_000, 0), { seller: 3_100_000, fee: 0 });
});

/* ---------------- smm ---------------- */
test("selling rate applies FX and markup and rounds up", () => {
  // USD provider at $0.45 per 1000, ₦1,600/$ → ₦720 cost; +50% → ₦1,080
  assert.equal(sellRatePer1000("0.45", 160_000, 5_000), 108_000);
  // NGN provider at ₦581.30 per 1000, +30%
  assert.equal(sellRatePer1000("581.30", 100, 3_000), 75_569);
  assert.equal(sellRatePer1000("0.0001", 160_000, 0), 16);
  assert.throws(() => sellRatePer1000("abc", 100, 0));
});

test("order cost and quantity limits", () => {
  assert.equal(orderCost(108_000, 1000), 108_000);
  assert.equal(orderCost(108_000, 250), 27_000);
  assert.equal(orderCost(7, 10), 1);
  assert.equal(validateQuantity(50, 100, 10_000), "The minimum for this service is 100.");
  assert.equal(validateQuantity(500, 100, 10_000), null);
});

test("provider statuses map and settle correctly", () => {
  assert.equal(mapProviderStatus("In progress"), "PROCESSING");
  assert.equal(mapProviderStatus("Canceled"), "CANCELLED");
  assert.equal(mapProviderStatus("whatever"), "PENDING");
  assert.equal(settleOrder(3_200, 1000, "PROCESSING", 300), null);
  assert.deepEqual(settleOrder(3_200, 1000, "COMPLETED", 0), { capture: 3_200, release: 0 });
  assert.deepEqual(settleOrder(3_200, 1000, "PARTIAL", 360), { capture: 2_048, release: 1_152 });
  assert.deepEqual(settleOrder(3_200, 1000, "CANCELLED", 1000), { capture: 0, release: 3_200 });
});

test("provider responses are parsed defensively", () => {
  const svcs = parseServices([
    { service: 1, name: "IG Followers", type: "Default", category: "Instagram", rate: "0.90", min: "50", max: "10000", refill: true },
    { service: 2, name: "Broken", rate: "free" },
  ]);
  assert.equal(svcs.length, 1);
  assert.equal(svcs[0].service, "1");
  assert.equal(svcs[0].min, 50);
  assert.equal(svcs[0].refill, true);
  assert.equal(parseAdd({ order: 23501 }), "23501");
  assert.throws(() => parseAdd({ error: "Not enough funds on balance" }), /Not enough funds/);
  const m = parseMultiStatus({ "1": { status: "Partial", remains: "157", start_count: "3572" }, "2": { error: "Incorrect order ID" } });
  assert.equal(m.get("1")?.status, "PARTIAL");
  assert.equal(m.get("1")?.remains, 157);
  assert.equal(m.get("2")?.error, "Incorrect order ID");
});

/* ---------------- listings ---------------- */
const good = { title: "Leather crossbody bag", description: "Genuine leather, tan colour, handmade in Lagos. Fits a phone and wallet.", category: "fashion", deliveryType: "physical", priceKobo: 2_850_000, stock: 14, minQty: 1, maxQty: 3 };

test("a normal listing passes", () => {
  assert.deepEqual(checkListing(good), { ok: true, problems: [] });
});

test("banned items are rejected with a reason", () => {
  const acct = checkListing({ ...good, title: "Aged Instagram account 10k followers" });
  assert.equal(acct.ok, false);
  assert.match(acct.problems.join(" "), /accounts can't be sold/);
  assert.equal(checkListing({ ...good, description: "Bank statement template, editable, any bank you want" }).ok, false);
  assert.equal(checkListing({ ...good, title: "Replica designer sneakers" }).ok, false);
  assert.equal(checkListing({ ...good, priceKobo: 50 }).ok, false);
  assert.equal(checkListing({ ...good, category: "accounts" }).ok, false);
});

/* ---------------- crypto ---------------- */
test("flutterwave webhook verification", () => {
  const body = JSON.stringify({ event: "charge.completed", data: { tx_ref: "AP-FUND-1" } });
  const hash = "my-secret-hash";
  const sig = createHmac("sha256", hash).update(body).digest("base64");
  assert.equal(verifyFlutterwaveWebhook(body, { verifHash: hash, signature: null }, hash), true);
  assert.equal(verifyFlutterwaveWebhook(body, { verifHash: "wrong", signature: null }, hash), false);
  assert.equal(verifyFlutterwaveWebhook(body, { verifHash: null, signature: sig }, hash), true);
  assert.equal(verifyFlutterwaveWebhook(body + " ", { verifHash: null, signature: sig }, hash), false);
  assert.equal(verifyFlutterwaveWebhook(body, { verifHash: null, signature: null }, hash), false);
  assert.equal(verifyFlutterwaveWebhook(body, { verifHash: "", signature: null }, ""), false);
});

test("api keys and references", () => {
  const k = generateApiKey();
  assert.match(k.key, /^ap_live_[A-Za-z0-9]{40}$/);
  assert.equal(hashApiKey(k.key), k.hash);
  assert.match(paymentReference("fund", new Date("2026-11-03T10:00:00Z")), /^AP-FUND-20261103-[A-Za-z0-9]{10}$/);
});

/* ---------------- analytics ---------------- */
test("site sections", async () => {
  const { sectionFor, isBot } = await import("../src/core/analytics.ts");
  assert.equal(sectionFor("/"), "Home page");
  assert.equal(sectionFor("/dashboard"), "Dashboard");
  assert.equal(sectionFor("/dashboard/", "#growth"), "Social Growth");
  assert.equal(sectionFor("/dashboard", "#trades"), "P2P Marketplace");
  assert.equal(sectionFor("/dashboard", "#nope"), "Dashboard");
  assert.equal(sectionFor("/market/abc?x=1"), "P2P Marketplace");
  assert.equal(sectionFor("/marketing"), "Other");
  assert.equal(sectionFor("/signup"), "Sign up");
  assert.equal(sectionFor("/admin"), null);
  assert.equal(sectionFor("/api/me"), null);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), false);
  assert.equal(isBot("Googlebot/2.1"), true);
  assert.equal(isBot(null), true);
});
