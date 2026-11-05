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
  assert.deepEqual(payoutSplit(3_100_000), { seller: 2_883_000, fee: 217_000 }); // 7%
  assert.deepEqual(payoutSplit(3_100_000, 300), { seller: 3_007_000, fee: 93_000 });
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
  assert.deepEqual(checkListing(good), { ok: true, problems: [], review: [] });
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

/* ---------------- catalog ---------------- */
test("catalog: platforms, kinds, policy, names", async () => {
  const { platformFor, kindFor, isRestricted, displayName } = await import("../src/core/catalog.ts");
  assert.equal(platformFor("tiktok"), "TikTok");
  assert.equal(platformFor("TikTok"), "TikTok");
  assert.equal(platformFor("twitter"), "X (Twitter)");
  assert.equal(platformFor("X (Twitter)"), "X (Twitter)");
  assert.equal(platformFor("apple_music"), "Apple Music");
  assert.equal(platformFor("some_new_thing"), "Some New Thing");
  assert.equal(kindFor("Instagram Followers | Non Drop"), "Followers");
  assert.equal(kindFor("TikTok Comment Likes"), "Likes");
  assert.equal(kindFor("Instagram Custom Comments"), "Comments");
  assert.equal(kindFor("YouTube Live Stream Views | 15 Minutes"), "Live viewers");
  assert.equal(kindFor("S2 TikTok Saves (100/20K) [R30]"), "Saves");
  assert.equal(kindFor("Spotify Track Plays"), "Plays");
  assert.equal(kindFor("Telegram Post Views | Cheapest"), "Views");
  assert.equal(kindFor("X (Twitter) Reposts"), "Shares");
  assert.equal(kindFor("YouTube Subscribers"), "Followers");
  assert.equal(kindFor("WhatsApp Channel Post Reaction | 👍"), "Likes");
  assert.equal(kindFor("Smart View (New , Old Posts)"), "Views");
  assert.equal(kindFor("Transcription / Data Entry"), "Other");
  assert.equal(isRestricted("Trustpilot Reviews", "trustpilot"), true);
  assert.equal(isRestricted("Amazon Star Rating", "amazon"), true);
  assert.equal(isRestricted("BBNaija Votes", "bbnaija"), true);
  assert.equal(isRestricted("Telegram Poll Votes", "telegram"), false);
  assert.equal(isRestricted("Facebook Poll Votes", "facebook"), false);
  assert.equal(isRestricted("Radio / TV Poll Votes", "voting"), true);
  assert.equal(isRestricted("Award Contest Votes", "More services"), true);
  assert.equal(isRestricted("Website IP Votes (100/25K)", "Website & SEO"), true);
  assert.equal(isRestricted("Stars Votes (50/5K)", "More services"), true);
  assert.equal(isRestricted("Instagram Story Poll Votes (100/10K)", "Instagram"), false);
  assert.equal(isRestricted("WhatsApp Poll Votes | High Quality", "WhatsApp"), false);
  assert.equal(kindFor("Telegram Poll Votes"), "Poll votes");
  assert.equal(isRestricted("Jumia / Konga Add-to-Cart", "marketplace"), true);
  assert.equal(isRestricted("Instagram Followers", "Instagram"), false);
  assert.equal(isRestricted("WhatsApp Channel Post Reaction", "WhatsApp"), false);
  assert.equal(displayName("S19 Instagram likes private (1/100K)"), "Instagram likes private (1/100K)");
  assert.equal(displayName("⭐ Twitch Live Stream Viewers"), "Twitch Live Stream Viewers");
  assert.equal(displayName("🖱️ LinkedIn Article Clicks"), "LinkedIn Article Clicks");
  assert.equal(displayName("S1 ⭐ Instagram Followers | Non Drop"), "Instagram Followers | Non Drop");
  assert.equal(displayName("★ S12 TikTok Views"), "TikTok Views");
  assert.equal(displayName("⭐"), "⭐");
});

/* ---------------- currency ---------------- */
test("display currency formatting", async () => {
  const cur = await import("../src/core/currency.ts");
  const rate = 160_000; // N1,600 per US$1
  assert.equal(cur.formatNaira(150_000), "\u20a61,500.00");
  assert.equal(cur.formatUsd(160_000, rate), "\u00241.00");
  assert.equal(cur.formatUsd(240_000_000, rate), "\u00241,500.00");
  assert.equal(cur.formatUsd(39, rate), "\u00240.00024");
  assert.equal(cur.formatUsd(1_600, rate), "\u00240.01");
  assert.equal(cur.formatUsd(0, rate), "\u00240.00");
  assert.equal(cur.formatUsd(-160_000, rate), "-\u00241.00");
  assert.equal(cur.formatMoney(150_000, "USD", 0), "\u20a61,500.00"); // no rate set: stay in Naira
  assert.equal(cur.formatMoney(150_000, "NGN", rate), "\u20a61,500.00");
});

test("provider 'recommended' flag in its many shapes", async () => {
  const { isProviderRecommended, parseServices } = await import("../src/core/smm.ts");
  assert.equal(isProviderRecommended({ recommended: true }), true);
  assert.equal(isProviderRecommended({ is_recommended: "1" }), true);
  assert.equal(isProviderRecommended({ featured: "yes" }), true);
  assert.equal(isProviderRecommended({ tag: "Recommended" }), true);
  assert.equal(isProviderRecommended({ badges: ["hot", "recommended"] }), true);
  assert.equal(isProviderRecommended({ recommended: false, tag: "" }), false);
  assert.equal(isProviderRecommended({ recommended: 0 }), false);
  // A Facebook "Recommendations" review in the NAME is not a recommended flag.
  assert.equal(isProviderRecommended({ name: "Facebook Page Recommendations", category: "Facebook" }), false);
  const [svc] = parseServices([{ service: 1, name: "IG Followers", category: "Instagram", rate: "1.5", min: 10, max: 100, recommended: 1 }]);
  assert.equal(svc.recommended, true);
});

test("provider extra fields are kept for inspection", async () => {
  const { extraFields } = await import("../src/core/smm.ts");
  assert.deepEqual(extraFields({ service: 1, name: "x", rate: "1", min: 1, max: 2, refill: true, cancel: false }), null);
  assert.deepEqual(extraFields({ service: 1, name: "x", badge: "Recommended", desc: "Fast" }), { badge: "Recommended", desc: "Fast" });
});

test("automatic dollar rate", async () => {
  const cur = await import("../src/core/currency.ts");
  const base = { ...cur.DEFAULT_USD_CONFIG };
  assert.equal(cur.effectiveUsdRate(base), 0); // nothing fetched yet: dollars off
  assert.equal(cur.effectiveUsdRate({ ...base, marketKobo: 153_420 }), 153_420);
  assert.equal(cur.effectiveUsdRate({ ...base, marketKobo: 150_000, adjustBps: 300 }), 154_500); // +3%
  assert.equal(cur.effectiveUsdRate({ ...base, marketKobo: 150_000, adjustBps: -1000 }), 135_000);
  assert.equal(cur.effectiveUsdRate({ ...base, mode: "manual", manualKobo: 160_000, marketKobo: 150_000 }), 160_000);
  assert.equal(cur.effectiveUsdRate({ ...base, mode: "manual", manualKobo: 0, marketKobo: 150_000 }), 0);
  assert.equal(cur.parseUsdNgn({ result: "success", rates: { USD: 1, NGN: 1534.21 } }), 153_421);
  assert.throws(() => cur.parseUsdNgn({ rates: {} }));
  assert.throws(() => cur.parseUsdNgn({ rates: { NGN: 1.2 } }));
});

test("listing policy: fewer false positives, review queue for borderline items", () => {
  // Honest wording no longer trips the counterfeit check.
  assert.deepEqual(checkListing({ ...good, description: "100% original sneakers, no fakes, comes with receipt and box." }).review, []);
  assert.equal(checkListing({ ...good, description: "Original perfume, not fake, sealed and with receipt." }).ok, true);
  // "fake" on its own goes to review rather than being rejected.
  const amb = checkListing({ ...good, description: "Fake leather jacket, black, size L, brand new." });
  assert.equal(amb.ok, true);
  assert.equal(amb.review.length, 1);
  // Gift cards and crypto are allowed but reviewed.
  const gc = checkListing({ ...good, title: "Amazon gift card $100", description: "Selling a $100 Amazon gift card, code sent after payment." });
  assert.equal(gc.ok, true);
  assert.match(gc.review.join(" "), /checked by our team/);
  assert.equal(checkListing({ ...good, category: "gift-cards-crypto" }).review.length, 1);
  // Blocked items stay blocked and are never just "reviewed".
  const bad = checkListing({ ...good, title: "Aged Instagram account plus USDT" });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.review, []);
  assert.equal(checkListing({ ...good, title: "Replica designer sneakers" }).ok, false);
  assert.equal(checkListing({ ...good, description: "Selling fresh bank logs and fullz, message me." }).ok, false);
});

test("listing category questions", async () => {
  const { normaliseQuestions, checkAnswers } = await import("../src/core/listingQuestions.ts");
  const qs = normaliseQuestions([
    { label: "Condition", type: "select", options: "New, Used, Refurbished", required: true },
    { label: "Storage (GB)", type: "number", required: false },
    { label: "Comes with box?", type: "yesno", required: true },
    { label: "   " },
  ]);
  assert.equal(qs.length, 3);
  assert.deepEqual(qs[0].options, ["New", "Used", "Refurbished"]);
  assert.throws(() => normaliseQuestions([{ label: "Colour", type: "select", options: "Red" }]));
  const ok = checkAnswers(qs, { [qs[0].id]: "Used", [qs[1].id]: "128", [qs[2].id]: "Yes", junk: "x" });
  assert.deepEqual(ok.problems, []);
  assert.equal(Object.keys(ok.answers).length, 3);
  const bad = checkAnswers(qs, { [qs[0].id]: "Broken", [qs[1].id]: "lots" });
  assert.equal(bad.problems.length, 3);
});

test("verification code pricing and outcomes", async () => {
  const v = await import("../src/core/smsVerify.ts");
  assert.equal(v.usdToMilli(0.5), 500);
  assert.equal(v.usdToMilli(1.2345), 1235);
  // $0.50 at ₦1,500/$ = ₦750; +300% = ₦3,000
  assert.equal(v.sellPriceKobo(500, 150_000, 30_000), 300_000);
  // rounds up to the next ₦10: $0.333 at ₦1,500 = ₦499.50 → ×4 = ₦1,998 → ₦2,000
  assert.equal(v.sellPriceKobo(333, 150_000, 30_000), 200_000);
  assert.equal(v.sellPriceKobo(500, 0, 30_000), 0);
  assert.equal(v.outcomeFor("verificationPending", false), "pending");
  assert.equal(v.outcomeFor("verificationTimedOut", true), "completed");
  assert.equal(v.outcomeFor("verificationCanceled", false), "refunded");
  assert.equal(v.extractCode("Your WhatsApp code: 123-456"), "123456");
  assert.equal(v.extractCode("G-482913 is your Google code"), "482913");
  assert.equal(v.extractCode("hello"), null);
  assert.equal(v.serviceLabel("google_voice"), "Google voice");
});

test("rate limit windows", async () => {
  const r = await import("../src/core/rateLimit.ts");
  assert.equal(r.windowStart(125_000, 60), 120_000);
  assert.equal(r.retryAfterSec(125_000, 60), 55);
  assert.equal(r.retryAfterSec(179_999, 60), 1);
  assert.equal(r.waitText(45), "45 seconds");
  assert.equal(r.waitText(61), "2 minutes");
  assert.equal(r.waitText(15 * 60), "15 minutes");
  assert.equal(r.waitText(3601), "2 hours");
});

test("eSIM order checks", async () => {
  const e = await import("../src/core/esim.ts");
  assert.deepEqual(e.checkImei("490154203237518"), { imei: "490154203237518" });
  assert.ok("error" in e.checkImei("490154203237519"));
  assert.ok("error" in e.checkImei("12345"));
  assert.deepEqual(e.checkImei("35-209900-176148-1"), { imei: "352099001761481" });
  assert.equal(e.usNumber("+1 (312) 216-9314"), "3122169314");
  assert.equal(e.usNumber("123"), null);
  assert.equal(e.formatUs("3122169314"), "+1 (312) 216-9314");
  assert.equal(e.buildLpa({ lpa: "lpa:1$sm-v4-001.prod.example.com$ABC-123" }), "LPA:1$sm-v4-001.prod.example.com$ABC-123");
  assert.equal(e.buildLpa({ smdp: "https://smdp.example.com", code: "XYZ" }), "LPA:1$smdp.example.com$XYZ");
  assert.equal(e.buildLpa({ lpa: "hello" }), null);
  assert.deepEqual(e.splitLpa("LPA:1$smdp.example.com$XYZ"), { smdp: "smdp.example.com", code: "XYZ" });
});

test("legal page text format is safe", async () => {
  const m = await import("../src/core/miniMarkdown.ts");
  const b = m.parseMarkdown("## 1. Title\n\nHello **there** see [Terms](/terms).\nsame para\n\n- one\n- two [mail](mailto:support@almightypumps.com)\n\n### Sub");
  assert.equal(b.length, 4);
  assert.equal(b[0].t, "h2");
  assert.equal(b[1].t, "p");
  assert.deepEqual((b[1] as { c: unknown[] }).c[1], { t: "bold", v: "there" });
  assert.equal(b[2].t, "ul");
  assert.equal(b[3].t, "h3");
  // dangerous links stay plain text; HTML is never interpreted
  const js = m.parseInline("[x](javascript:alert(1))");
  assert.ok(js.every((p) => p.t === "text"));
  assert.equal(js.map((p) => p.v).join(""), "[x](javascript:alert(1))");
  assert.equal(m.safeHref("//evil.com"), null);
  assert.equal(m.safeHref("https://www.cloudflare.com/turnstile-privacy-policy/"), "https://www.cloudflare.com/turnstile-privacy-policy/");
  assert.deepEqual(m.parseInline("<script>x</script>"), [{ t: "text", v: "<script>x</script>" }]);
});

/* ---------------- instant products (Reloadly, eSIM Access) ---------------- */
import { costToKobo, withMarkup, parseGiftProduct, giftCost, ngPhone, guessNetwork, networkOf, dataSize, durationLabel, e4ToKobo } from "../src/core/instant.ts";

test("instant pricing: cost to kobo and markup rounding", () => {
  assert.equal(costToKobo(1000, "NGN", 160_000), 100_000);
  assert.equal(costToKobo(10, "USD", 160_000), 1_600_000);
  assert.equal(costToKobo(10, "EUR", 160_000), null);
  assert.equal(costToKobo(10, "USD", 0), null);
  assert.equal(withMarkup(100_000, 0, 100), 100_000);          // airtime at face value
  assert.equal(withMarkup(1_600_000, 1500, 1000), 1_840_000);  // +15%, ₦10 steps
  assert.equal(withMarkup(123_456, 0, 1000), 124_000);         // always rounds up
  assert.equal(e4ToKobo(9000, 160_000), 144_000);              // $0.90
});

test("instant: gift card parsing and cost", () => {
  const fixed = parseGiftProduct({
    productId: 5, productName: "Amazon US", denominationType: "FIXED", recipientCurrencyCode: "USD", senderCurrencyCode: "NGN",
    fixedRecipientDenominations: [25, 10], fixedSenderDenominations: [40000, 16000], fixedRecipientToSenderDenominationsMap: { "10.0": 16100, "25.0": 40250 },
    senderFee: 100, senderFeePercentage: 0, country: { isoName: "US" }, brand: { brandName: "Amazon" }, logoUrls: ["https://cdn.reloadly.com/a.png", "javascript:x"],
  });
  assert.ok(fixed);
  assert.deepEqual(fixed!.data.fixed, [{ value: 10, cost: 16100 }, { value: 25, cost: 40250 }]);
  assert.equal(fixed!.data.logo, "https://cdn.reloadly.com/a.png");
  assert.equal(giftCost(fixed!.data, 10), 16200);
  assert.equal(giftCost(fixed!.data, 15), null);
  const range = parseGiftProduct({
    productId: 6, productName: "Steam", denominationType: "RANGE", recipientCurrencyCode: "USD", senderCurrencyCode: "USD",
    minRecipientDenomination: 5, maxRecipientDenomination: 100, minSenderDenomination: 5.1, maxSenderDenomination: 102, country: { isoName: "US" }, brand: { brandName: "Steam" },
  });
  assert.equal(range!.data.type, "RANGE");
  assert.equal(giftCost(range!.data, 50), 51.51);   // 50 × 1.02 × 1.01 rounded up to cents
  assert.equal(giftCost(range!.data, 200), null);
  assert.equal(parseGiftProduct({ productId: "x" }), null);
});

test("instant: Nigerian numbers and networks", () => {
  assert.equal(ngPhone("0803 123 4567"), "08031234567");
  assert.equal(ngPhone("+234 803 123 4567"), "08031234567");
  assert.equal(ngPhone("8031234567"), "08031234567");
  assert.equal(ngPhone("0603 123 4567"), null);
  assert.equal(ngPhone("0803123456"), null);
  assert.equal(guessNetwork("08031234567"), "MTN");
  assert.equal(guessNetwork("08021234567"), "Airtel");
  assert.equal(guessNetwork("08051234567"), "Glo");
  assert.equal(guessNetwork("09091234567"), "9mobile");
  assert.equal(networkOf("MTN Nigeria Data"), "MTN");
  assert.equal(networkOf("9Mobile (Etisalat) Nigeria"), "9mobile");
  assert.equal(networkOf("Glo Nigeria Bundles"), "Glo");
  assert.equal(networkOf("Safaricom Kenya"), null);
});

test("instant: travel eSIM labels", () => {
  assert.equal(dataSize(1024 ** 3), "1GB");
  assert.equal(dataSize(3 * 1024 ** 3 / 2), "1.5GB");
  assert.equal(dataSize(500 * 1024 ** 2), "500MB");
  assert.equal(durationLabel(1, "DAY"), "1 day");
  assert.equal(durationLabel(30, "DAY"), "30 days");
});

test("shipping: price, phone, tracking code", async () => {
  const { shippingPrice, intlPhone, shipmentCode } = await import("../src/core/shipping.ts");
  assert.equal(shippingPrice(400_000, 1500), 460_000); // ₦4,000 + 15% = ₦4,600
  assert.equal(shippingPrice(400_100, 1500), 465_000); // rounds up to the next ₦50
  assert.equal(shippingPrice(100_000, 0), 100_000);
  assert.throws(() => shippingPrice(0, 1500));
  assert.equal(intlPhone("0803 123 4567", "NG"), "+2348031234567");
  assert.equal(intlPhone("2125551234", "US"), "+12125551234");
  assert.equal(intlPhone("+447700900123", "GB"), "+447700900123");
  assert.equal(intlPhone("07700 900123", "GB", "44"), "+447700900123");
  assert.equal(intlPhone("0241234567", "GH", "233"), "+233241234567");
  const c = shipmentCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 30]));
  assert.match(c, /^AP[A-Z2-9]{8}$/);
  assert.ok(!/[01OIL]/.test(c.slice(2)));
});

test("services: tile order", async () => {
  const { sortByOrder, hiddenTiles } = await import("../src/core/switches.ts");
  const t = [{ id: "boost" }, { id: "esim" }, { id: "airtime" }, { id: "shop-new" }];
  assert.deepEqual(sortByOrder(t, ["airtime", "boost"]).map((x) => x.id), ["airtime", "boost", "esim", "shop-new"]);
  assert.deepEqual(sortByOrder(t, []).map((x) => x.id), ["boost", "esim", "airtime", "shop-new"]);
  assert.deepEqual(sortByOrder(t, ["gone", "esim"]).map((x) => x.id), ["esim", "boost", "airtime", "shop-new"]);
  assert.ok(hiddenTiles(["esim_us", "esim_travel"]).has("esim"));
  assert.ok(!hiddenTiles(["esim_us"]).has("esim"));
});

import { namesMatch } from "../src/core/identity.ts";
test("withdrawal name matching", () => {
  assert.ok(namesMatch("Bayo Adeyemi", "ADEYEMI BAYO"));
  assert.ok(namesMatch("Bayo Adeyemi", "ADEYEMI OLUWABAYO BAYO"));
  assert.ok(namesMatch("Mr. Bayo T. Adeyemi", "ADEYEMI BAYO TUNDE"));
  assert.ok(namesMatch("Chika Eze-Obi", "EZE OBI CHIKA"));
  assert.ok(!namesMatch("Bayo Adeyemi", "ADEYEMI CHUKWUDI"));
  assert.ok(!namesMatch("Bayo Adeyemi", "BAYO"));
  assert.ok(!namesMatch("Bayo Adeyemi", "OKAFOR JOHN PETER"));
  assert.ok(!namesMatch("", "ADEYEMI BAYO"));
});
