# Almighty Pumps: project briefing for Claude Code

## Owner rules (always follow)
- **Ask the owner before anything goes live.** Never push to `main`, merge into `main`,
  promote a Vercel deployment to production, or change the Neon `main` branch without
  an explicit "yes" in the conversation.
- Day-to-day work goes on the `dev` branch. Vercel builds every `dev` push as a
  private preview. Send the owner the preview link and ask before promoting.
- Never put secrets (database passwords, Flutterwave keys, provider API keys,
  SESSION_SECRET, CRON_SECRET) in code, commits or this file. They live in Vercel
  environment variables and the local `.env` (git-ignored).
- The owner is building a business, not learning to code: explain results in plain
  words, keep them short, and say what they need to click or approve.

## What the product is
A Nigerian platform (Naira wallet) with:
1. Social-growth reselling: buy followers/likes/views from upstream SMM panels
   (standard panel API v2) and resell with a markup. Pay-on-delivery: money is held,
   then captured, partly captured or refunded based on provider status.
2. P2P marketplace with escrow (layout inspired by Bybit P2P): verified sellers post ads,
   buyer pays into escrow, seller ships, buyer confirms authenticity, funds release
   (3% seller fee). Auto-release after 48h inspection; auto-refund if not shipped in 72h;
   disputes resolved by admins.
3. Planned: Mockup Studio, business document generator (invoices, receipts, CVs, own
   staff ID cards), website templates.
4. Reseller API (`/api/v2`) so others can resell our services.

Listing rules (`src/core/listingPolicy.ts`): BLOCKED = refused outright, not adjustable:
fake/forged ID and financial documents, counterfeit goods, social media/gaming/email account
sales, stolen cards/logs/hacking tools, weapons and drugs. 2026-11-03 the owner asked to drop
these "hard limits"; Claude declined to (fraud/illegal goods harming third parties) and
softened the rest instead: fewer false positives ("no fakes" is fine), gift cards & crypto
allowed on P2P via the REVIEW queue (listing status `pending` until an admin approves in
/admin/listings), ambiguous "fake" wording also goes to review. The same BLOCKED list
(`blockedReasons`) applies to admin shop products.

## Stack
Next.js 15.5 (App Router) + React 19 + TypeScript, PostgreSQL on Neon via drizzle-orm + pg,
jose sessions, bcryptjs, zod 4, Flutterwave (payments; switched from Paystack 2026-11-03), three.js/gsap/lenis for the 3D homepage.
Hosting on Vercel (functions in `fra1` next to the Frankfurt database).

## Layout
- `src/core/` pure business rules with no dependencies: money (integer kobo), ledger,
  escrow state machine, SMM pricing/parsing, listing policy, crypto helpers.
  Tested by `tests/core.test.ts` (`npm test`, Node's built-in runner, 37 tests).
- `src/server/` database access, wallet (row locks, holds, idempotent ledger),
  market, smm, payments (Flutterwave), auth, env, http helpers.
- Customer dashboard (`app/dashboard` → `src/components/dashboard/`): tabs Services / Orders /
  Wallet / P2P / Settings (URL hash; bottom tab bar on phones). Services = hub of service tiles from
  `src/components/dashboard/services.ts` (Boost Account, Get Verification Code and eSIMs live). Boost Account (#boost) = all SMM/Owlet services: search + platform tiles +
  kind chips + paged service cards (recommended first, then cheapest) + order sheet.
  "Recommended" = provider flag (`provider_recommended`, detected by `isProviderRecommended`;
  sync logs the provider's field names as `[provider] … service fields`) OR admin star
  (`featured`, /admin/services, kept across syncs). Owner asked for a "Buy Account" tile, then to
  rename it: built "Gift Cards & Subscriptions" (official vouchers) instead; selling
  social/gaming accounts stays out (owner's hard limit). Provider extra per-service fields are
  stored in `smm_services.provider_extra` to see how a panel tags "recommended". Catalogue data comes from
  `smm_services.platform/kind/display_name`, set at sync by `src/core/catalog.ts`.
- **Service policy:** `isRestricted` in `src/core/catalog.ts` keeps fake reviews/ratings,
  contest/broadcast/website voting (BBNaija, radio/TV, "IP votes") and fake add-to-carts out
  of the store (hidden at sync). 2026-11-03: owner asked to sell these; agreed to allow
  social-media poll votes only (kind "Poll votes"); Claude declined to enable fake reviews,
  contest votes and add-to-carts (third-party deception, FCCPC/FTC risk, payment-provider risk).
- Settings tab (`Settings.tsx`, `/api/me/settings`): profile (name/phone; email read-only, no email
  sending yet), theme Dark/Light/Match phone (`src/components/Theme.tsx`: localStorage `ap_theme`,
  boot script in <head>, `html[data-theme=light]` tokens in app.css; homepage "/" always dark),
  ₦/$, change password + log out other devices (`users.session_version` in the JWT `v` claim,
  migration 0009), seller application, reseller API keys (create/revoke), admin link, log out.
  Dashboard balance card has an eye button (hide/show balance as *****, remembered in localStorage
  `ap_hide_balance`; also masks the Wallet tab amounts). App colours use `rgb(var(--ov) / a)` overlays + tokens so both themes work; keep it that way.
- Sellers (`src/server/sellers.ts`, migration 0010 `seller_profiles`): Settings → "Become a seller" form
  (shop name, phone, what they sell, bank from `src/core/banks.ts`, 10-digit account, account name,
  ID type+number). Status none → pending → verified/rejected (reason required; re-apply allowed).
  /admin/sellers shows full ID/account (admins only; sellers see masked). Verified sellers get the
  Seller panel in the P2P tab (`SellerPanel.tsx`): post/edit (policy re-check; flagged or previously
  declined → review)/pause/resume/remove ads, orders to deliver (SHIP with proof, or CANCEL = refund),
  sales history, earnings after the 3% fee. APIs: /api/seller/{apply,listings,listings/[id],orders}.
- P2P categories (migration 0011 `listing_categories`, `src/server/listingCategories.ts`, /admin/p2p-categories):
  admin creates categories, each with its own seller questions (`src/core/listingQuestions.ts`: short/long
  answer, number, pick-from-list, yes/no; required flag; hint) and an "needs my approval" switch
  (`requires_review` → ads go to pending). Sellers pick a category first in the ad form and answer its
  questions; answers are stored in `listings.answers`, policy-checked, and shown to buyers.
  `prepareListing` in `market.ts` does all checks for create and update.
- P2P tab for everyone = Marketplace (`Marketplace.tsx`, layout inspired by Bybit P2P: seller, badge,
  orders/completion, price, limits, stock, orange Buy (same style as .btn-primary)) → buy sheet (answers, quantity, escrow). Verified
  sellers also get "My ads & sales". "Become a seller" lives only in Settings. Buyers' "My trades" has
  `TradeActions.tsx`: confirm received, dispute, or cancel & refund after the 72h ship deadline.
- Shop picture (migration 0012 `seller_avatars`, bytea in its own table): `ShopPhoto.tsx` in Settings
  (verified/pending) and the Seller panel; the browser crops to a 320px square WebP/JPEG before upload.
  `POST/DELETE /api/seller/avatar` (data URL, ≤300 KB, magic-byte check); served by
  `/api/sellers/[id]/avatar?v=…` only for verified sellers, cached immutable. Marketplace rows and the
  buy sheet show it (initial letter as fallback). Ad photos still need proper file storage (Vercel Blob).
- Get Verification Code (#verify, migration 0013, `src/server/smsVerify.ts`, `src/server/textverified.ts`,
  `VerifyCode.tsx`, /admin/verify): TextVerified API v2 (auth POST /api/pub/v2/auth with X-API-KEY +
  X-API-USERNAME → bearer; env TEXTVERIFIED_API_KEY / TEXTVERIFIED_API_USERNAME, both set in Vercel
  Preview(dev)+Production; TEXTVERIFIED_BASE_URL overrides for local mocks). US mobile numbers, SMS only. Provider list: ~4.7k rows, `capability` is "Sms" (capital S), `description` = display name (stored in `sms_services.label`, migration 0014); "servicenotlisted" and non-refundable ones are skipped.
  Service list synced daily (`sms_services`, admin can hide); price fetched per service on demand (cached
  15 min) in USD → Naira via the site dollar rate × (1 + markup), rounded up to ₦10 (`src/core/smsVerify.ts`).
  Markup in `app_settings.sms_verify.markupBps` (owner set 300% = 30000 on 2026-11-03; editable in
  /admin/verify, plus pause/resume). Per-app fixed Naira price `sms_services.fixed_price_kobo` (migration 0015,
  "Set price" in /admin/verify; null = markup; admin warned when below cost). Owner confirmed the preview working 2026-11-03. Pay-on-delivery: hold `sms_verify` on rent (create with
  maxPrice = quoted cost), capture to `revenue:sms_verify` when a code arrives, release on
  cancel/timeout/provider failure. One waiting number per customer. Client polls /api/verify/[id] every
  5 s; the sync-orders cron sweeps pending ones. Keep "Allow Non-Refundable Services via API" OFF on
  TextVerified so our refunds match theirs.
- Money tools (`src/server/adminMoney.ts`, `src/components/AdminMoney.tsx`, GET /api/admin/money?view=…):
  /admin/money = platform wallet (balance, earnings by ledger kind today/7d/30d/all, customer money held,
  withdrawals to pay, open disputes); /admin/withdrawals = MANUAL payouts (owner chose manual 2026-11-03):
  customer requests in Wallet tab (`Withdraw.tsx`, pre-filled from seller payout account or last one, min
  MIN_WITHDRAWAL_KOBO, max 3 waiting) → hold; admin sends the bank transfer, taps "mark paid" (capture) or
  rejects with a reason (release). Queue flags stolen-card patterns (unspent top-ups, topped up <24h,
  account <3 days, account differs from seller profile). /admin/disputes = DISPUTED trades with complaint,
  seller proof, contacts, timeline/messages → Refund buyer / Pay seller (`act` RESOLVE_*). Wallet history
  lines without a memo get friendly names (`kindLabel` in app/dashboard/page.tsx).
- Rate limiting (`src/server/rateLimit.ts`, migration 0016 `rate_limits`, maths in `src/core/rateLimit.ts`):
  Postgres fixed-window counters (work across Vercel instances), keys HMAC-hashed with SESSION_SECRET (no
  raw IPs/emails). Rules in `LIMITS` (login 30/15min per IP + 10/15min per email, signup 6/h per IP,
  password change, top-up, withdraw, orders, buys, trade actions/messages, verification, seller apply/avatar,
  listings, API keys, reseller /api/v2 120/min per key, /api/track silent drop). Over the limit = 429 with
  Retry-After and "Please wait N minutes"; a failing counter allows the request. Counters >1 day old are
  pruned by the sync-orders cron. IP = first x-forwarded-for (set by Vercel).
- Providers from the admin (migration 0017, /admin/providers `AddProvider` + card "Edit"): paste any standard
  SMM panel (API v2) URL + key → "Test connection" (balance + service count) → save. Keys are stored
  AES-256-GCM encrypted in `smm_providers.api_key_enc` (`src/server/secretBox.ts`, key derived from
  SESSION_SECRET: changing SESSION_SECRET means re-pasting provider keys), shown only as ••••last4;
  `api_key_env` still works for env-held keys (Owlet). Non-NGN panels: ₦ per unit, or blank = follow the site
  dollar rate (`fx_auto`, refreshed on each sync). New key/URL is tested before saving; http allowed only for
  localhost (tests). "Connections" list at the top of /admin/providers: On/Off switch per API (= `active`;
  Disconnect/Connect also on each card) and Remove (DELETE /api/admin/providers/[id]; refused if any of its
  services has orders, then disconnect instead).
- Same service from several providers (migration 0018): generated `smm_services.match_key` =
  platform|kind|lowercased alphanumeric name. Only copies from DIFFERENT providers are combined (Owlet itself has
  ~2k same-named services; those all stay listed): `notBeatenByOtherProvider()` hides a service when another connected
  provider sells the same key cheaper (tie: lower public_id). Used by `browseServices` and `serviceCatalog`; recommended
  if any provider's copy is. `placeOrder` uses the customer's pick if on sale, else the cheapest other-provider copy
  priced ≤ what they were shown (else "price just changed"). Reseller /api/v2 `services` still lists every copy.
  Migrations 0017–0018 applied to dev and production (2026-11-04, owner's yes).
- eSIMs sold by hand (#esim, migration 0019, `src/server/esim.ts`, `src/core/esim.ts`, `Esim.tsx`, /admin/esim
  `AdminEsim.tsx`): owner's supplier (Airvoice-style US prepaid, AT&T) has no API and blocked his country, so the
  admin defines plans (name, network, description, keep-number on/off + fee) with a price grid (data label ×
  months → ₦; quick-fill rows). Customer: data chips → length cards (per-month + % saving vs 1 month) → IMEI
  (14–16 digits, Luhn for 15) → new number or keep number (port-in: number, carrier, account no., PIN, ZIP,
  holder; stored encrypted with secretBox and wiped on deliver/refund) → hold `esim_order` (max 3 pending).
  Admin queue: copy IMEI/port details, deliver with US number + activation code (LPA:1$…, or SM-DP+ + code,
  or uploaded QR picture) + note → capture to `revenue:esim`; or refund with a reason. Customer sees number,
  QR (generated server-side with `qrcode` 1.5.4), iPhone one-tap install link, SM-DP+/code with copy buttons.
- Login security (2026-11-04): `PasswordInput.tsx` eye toggle on all password fields; "Remember me" on /login =
  30-day cookie + JWT claim r=1, otherwise a browser-session cookie with a 12h token (`startSession(userId, remember)`;
  password change / log-out-others keep the current choice); remembered email in localStorage `ap_login_email`
  (never the password). EMAIL CODES replaced Cloudflare Turnstile (owner's choice 2026-11-04; `src/server/captcha.ts` and
  the CSP entries for challenges.cloudflare.com removed; TURNSTILE_* env vars are unused): migration 0021
  (`users.email_verified_at`, existing users marked verified; `email_codes`, `trusted_devices`), `src/server/emailCodes.ts`,
  `src/server/email.ts` (Resend API; env RESEND_API_KEY, EMAIL_FROM default "Almighty Pumps <no-reply@almightypumps.com>",
  RESEND_BASE_URL for mocks). A 6-digit code (10 min, 5 tries, HMAC-stored) at sign-up and when logging in on a device
  without a valid `ap_device` cookie (trusted 30 days; other devices forgotten on password change / log-out-others).
  Login/register reply { needsCode, challenge, email, purpose } → POST /api/auth/verify { challenge, code } (or
  /api/auth/verify/resend). An unfinished sign-up can be redone with the same email. Codes are OFF (straight log in)
  while RESEND_API_KEY is unset, so set it in Production before/with going live. Weak/common passwords refused (`weakPassword`). `middleware.ts` blocks cross-site POST/PUT/PATCH/
  DELETE to /api/* (Origin/Sec-Fetch-Site), except /api/v2, /api/webhooks/, /api/cron/. next.config.mjs adds HSTS,
  CSP (scripts self+inline+challenges.cloudflare.com, fonts.googleapis/gstatic, img data:/blob:, frame-ancestors none,
  form-action self; upgrade-insecure-requests only on Vercel) and COOP. Generic "email and password don't match"
  with a dummy bcrypt compare already existed, as do the login/signup rate limits.
- Forgot password (2026-11-04, migration 0022 adds purpose 'reset' to email_codes): "Forgot password?" link on /login →
  /forgot-password (`ForgotPassword.tsx`) → POST /api/auth/forgot (same reply for unknown emails: fake challenge) → code +
  new password → POST /api/auth/reset (`resetPassword` in auth.ts: weak-password check first, then `checkCode(..., ["reset"])`,
  bumps session_version, forgets other trusted devices, signs in here). /api/auth/verify only accepts signup/login codes.
- Manual top-ups: bank transfer + crypto (2026-11-04, owner's choice "manual for now", migration 0022 `manual_deposits`,
  `src/server/manualPayments.ts`, `ManualPay.tsx` in the Wallet tab, /admin/payments `AdminPayments.tsx`, /api/wallet/manual,
  /api/admin/payments). Admin lists methods in app_settings `manual_payments` (bank: bank/10-digit account/name; crypto:
  coin/network/address, QR generated server-side), crypto rate ₦ per $1 (0 = site dollar rate; USDT/USDC etc. get an
  exact coin amount, others "$X worth of"), extra notify emails. Customer: method → ₦ amount (min MIN_FUNDING_KOBO) →
  exact instructions (bank narration code `AP-xxxxxx` from user id) → tx hash / sender name → "I have made payment"
  (max 3 pending; crypto tx IDs can't be reused) → every admin's email (+ extra emails) gets a notice via `sendNotice`
  (`src/server/email.ts`). Admin "Confirm & fund" (amount editable) = creditWallet kind `deposit`, idempotency
  `manual:<id>`; or reject with a reason. Customer is emailed either way. Terms/Privacy defaults mention it. eSIM tab
  shows "US phone line" first (default), then "Travel data · instant" (owner's request).
- SUPPLIER OUT OF MONEY (2026-11-04, owner's request, migration 0023): `src/server/supplierFunds.ts` (`isOutOfFunds` regex on
  supplier errors, `alertSupplierFunds` emails all admins at most once an hour per supplier via app_settings
  `supplier_alerts`, `WAIT_LIMIT_MS` = 72h). Boost: `placeOrder` keeps the hold and sets smm_orders.status `QUEUED`
  ("In queue" for customers; /api/v2 shows Pending); `retryQueuedOrders` in the sync-orders cron re-sends oldest first,
  stops per provider while still broke, refunds after 72h or on a real refusal. Gift cards / airtime / travel eSIMs:
  `waiting_funds` column; `sendGiftOrder` / `sendTopup` / `sendTravelOrder` re-send from the existing sweeps; customers see
  "In the queue… only charged once delivered". TextVerified (can't wait): customer gets "temporarily unavailable" and admins
  are emailed. Admin Home shows "Top up <supplier>: N orders waiting" (`waitingBySupplier`), badge key `waitingFunds`.
- SELL GIFT CARDS & CRYPTO (2026-11-04, owner's request; manual review desk, migration 0024 `trade_ins` + `trade_in_images`
  (bytea photos), `src/server/sellDesk.ts`, customer tile "Sell Gift Cards & Crypto" (#sell, `SellDesk.tsx`, chips "Sell gift
  cards" / "Sell crypto"), admin /admin/sell (`AdminSell.tsx`, menu "Gift cards & crypto bought", badge `sell`), /api/sell,
  /api/admin/sell, /api/admin/sell/images/[id] (admin-only)). Config app_settings `sell_desk` {enabled (default OFF),
  dailyLimitKobo per customer per 24h, cards[{name, currency, physicalRateKobo, ecodeRateKobo (₦ per 1 unit; 0 = not
  bought), min, max, note}], coins[{coin, network, address, rateKobo per $1, min $}]}. Customer submits value + e-code /
  photos (shrunk in-browser, ≤4, magic-byte checked) or crypto tx hash; duplicate code/hash refused; max 5 pending.
  Admins emailed; "Approve & pay" (amount editable) = creditWallet kind `tradein:giftcard|crypto`, idempotency
  `tradein:<id>`; reject with reason; customer emailed. Terms default has a "Selling us gift cards or crypto" section.
  Owner was told: crypto buying needs SEC registration in Nigeria (ARIP, draft rules Aug 2026) → automate later via a
  licensed partner (Breet or Busha API) and get legal advice; gift cards carry fraud risk (KYC, limits).
- Legal pages (2026-11-04): /privacy and /terms (`app/privacy`, `app/terms`, shared `src/components/LegalPage.tsx`,
  CSS `.legal-doc` (NOT `.legal`: that class is the homepage footer's mono copyright line)). Plain-English drafts,
  NDPA 2023, list every processor (Flutterwave, SMM providers, TextVerified, eSIM supplier, Cloudflare Turnstile with
  the Turnstile Privacy Addendum link required for Invisible mode, Vercel, Neon EU, Zoho), cookies ap_session/ap_vid,
  escrow 72h/48h/3%, ₦1,000 top-up / ₦2,000 withdrawal minimums, prohibited items. Linked from the homepage footer and
  the sign-up form. Owner told to have a lawyer review. Keep them in sync when features/processors change.
  EDITABLE in Admin → Legal pages (/admin/legal, `AdminLegal.tsx`, /api/admin/legal): text stored in app_settings
  `legal_privacy` / `legal_terms` as {body, updated YYYY-MM-DD (Lagos)}; originals in `src/content/legal.ts` (used until
  edited and for "Reset to original"). Safe mini-format (`src/core/miniMarkdown.ts` + `RichText.tsx`): ## / ### headings,
  "- " bullets, **bold**, [text](https|mailto|/path) links; never renders HTML; js: links stay plain text. Pages are
  force-dynamic so saves show immediately.
  PUBLIC CONTACT EMAIL = support@almightypumps.com (owner's rule, 2026-11-04): use it everywhere customers see
  (legal pages, footer Support link); hello@ is only for supplier sign-ups.
- ADMIN FRAME (redesign 2026-11-04, owner asked for "simple and easy"): `app/admin/layout.tsx` → `AdminShell` in
  `src/components/AdminNav.tsx` (sidebar on computers; on phones a sticky top bar with page title + "Menu" button that opens a
  drawer). Menu groups live in `src/components/adminMenu.ts` (Home; Money; What you sell; P2P marketplace; Website) with red
  count badges from `adminCounts` (`src/server/adminHome.ts`, refreshed via GET /api/admin/counts on every page change).
  /admin = Home: "Needs your attention" (payments to confirm, withdrawals, disputes, US eSIMs, shop orders, stuck instant
  orders >15 min, seller applications, ads to review), today's numbers (Lagos day: sales, top-ups, new customers, platform
  wallet + money customers hold) and a card per menu group with one-line descriptions. Insights moved to /admin/insights
  ("Visitors & sales"). New admin pages: add them to `adminMenu.ts` (+ a description in ABOUT in app/admin/page.tsx).
- `app/api/**` route handlers; `app/page.tsx` 3D homepage; `app/signup`, `app/login`,
  `app/dashboard`; `app/admin` (Insights, Growth providers, Services, Pricing, Shop, Listings review; admins only).
- Shop (`src/server/shop.ts`, /admin/shop, migration 0008): admin categories → products. Delivery
  `code` (admin pastes codes; buyer instantly gets the next unused one, paid at once) or `manual`
  (hold placed; admin marks delivered = capture to platform wallet `revenue:shop`, or refunds).
  Optional `ask_customer` question and `stock_limit` for manual. Categories with a live product
  show as tiles on the customer Services home (`#shop-<slug>`), replacing a same-named
  "coming soon" tile. Customer shop orders + codes show under Orders. NOTE: correlated SQL
  subqueries must name the outer table explicitly ("shop_products"."id"); drizzle renders
  single-table columns unqualified, which silently binds to the inner table.
- Pricing (`src/server/pricing.ts`, /admin/pricing): markup = most specific of
  `smm_pricing_rules` platform+kind → platform (kind NULL) → provider `markup_bps`.
  `reprice()` recomputes `rate_kobo` in SQL (same maths as `sellRatePer1000`); called after
  rule changes, provider markup changes and every sync. Minimum order amount lives in
  `app_settings.min_order_kobo` (0 = none), enforced in `placeOrder` (web + /api/v2) and
  shown in the order sheet.
- Dollar display: `app_settings.usd` JSON (`UsdConfig` in `src/core/currency.ts`): mode `auto`
  (market rate from open.er-api.com, refreshed every 6h by the sync-orders cron and the admin
  pricing page; optional % adjustment; a failed fetch keeps the last good rate) or `manual`.
  Override the feed URL with env `FX_RATE_URL` (tests). Display only: wallet, top-ups and charges stay in Naira. Customer ₦/$ switch
  (`src/components/dashboard/Currency.tsx`, remembered in localStorage); formatting in
  `src/core/currency.ts`. Charged amounts always show Naira (`charge()`), with ≈$ alongside.
- Service visibility: `smm_services.hidden_reason` null = on sale, `admin` (hidden in
  /admin/services, survives syncs), `policy` (isRestricted; can't be unhidden), `provider`
  (dropped upstream or 0-priced; returns on next sync if listed). `active` mirrors it.
- Insights: `src/components/Tracker.tsx` beacons each page and dashboard #section to
  `/api/track` → `site_events` (anonymous cookie id, no IP/UA stored). Section names come
  from `src/core/analytics.ts` (add new pages there). Queries in `src/server/insights.ts`.
- `src/landing/` homepage markup + effects ported from the approved prototype. Copy rewritten 2026-11-04 for the
  real services (Boost Account, Verification codes, US eSIMs, P2P escrow, Reseller API; hero "Boost. Verify. Trade.";
  pricing = free account / pay per order / 3% seller fee; ticker = real highlights, no fake activity). Don't advertise
  unbuilt products (Mockup Studio, documents, templates) there until they exist. Performance (2026-11-03):
  text renders over a static `.scene-fallback` gradient; three.js is imported only after `load` +
  idle; scene built in stages (nebula+orb → shards/gates/dust/grid → bloom), each its own task;
  adaptive quality drops bloom → resolution → 30fps if frames > 34ms; weak devices / data saver /
  reduced motion keep the gradient. `performance.mark('ap:*')` timings. Fonts load non-blocking.
- `drizzle/*.sql` migrations, applied in order by `scripts/migrate.mjs` (tracked in `_migrations`);
  `src/server/db/schema.ts` mirrors them. New schema change = new numbered file + schema.ts.
- `scripts/migrate.mjs`, `scripts/seed.mjs`.
- Instant API products (2026-11-04, migration 0020, pay-on-delivery: hold → provider → capture `revenue:<kind>` / release):
  - Reloadly client `src/server/reloadly.ts` (OAuth per audience; RELOADLY_ENV sandbox|live, default live on production and
    sandbox elsewhere, auto-falls back to the other mode if the keys are refused; RELOADLY_MOCK_URL for local tests).
    Gift cards `src/server/giftCards.ts` + `GiftCards.tsx` (#giftcards, "Gift Cards & Subscriptions" tile now live): catalogue
    in `gift_products` synced daily for app_settings `gift_cards.countries` (default US, GB, CA, NG), markup default 15%,
    codes stored encrypted (secretBox) in `gift_orders.codes_enc`. Airtime/data `src/server/airtime.ts` + `Airtime.tsx`
    (#airtime, Nigeria only, MTN/Airtel/Glo/9mobile; operators cached 6h in app_settings `airtime_operators`; markups
    default 0% = face value, Reloadly discount is the profit) in `topup_orders`.
  - eSIM Access client `src/server/esimaccess.ts` (HMAC-SHA256 RT-Signature; ESIMACCESS_BASE_URL for mocks). Travel eSIMs
    `src/server/travelEsim.ts` + `TravelEsim.tsx`: eSIMs tab now has two chips, "Travel data · instant" (default) and
    "US phone line" (the manual `Esim.tsx`). Packages in `travel_packages` synced daily, markup default 150%, live price
    re-checked before each order; QR generated from the LPA; usage check.
  - Pricing maths in `src/core/instant.ts` (tested). Admin: /admin/instant (`AdminInstant.tsx`, /api/admin/instant) with tabs
    for markups, pause, provider balance, catalogue sync, star/hide, recent orders, "Check / refund" for stuck ones.
    The sync-orders cron sweeps pending orders of all three. CSP img-src allows https://*.reloadly.com (gift card logos).
  - API notes: `docs/integrations-reloadly-esimaccess.md` (docs sites are blocked from the sandbox; field names verified
    only against public client code; check runtime logs `[giftcards]`, `[airtime]`, `[esimaccess]`, `[reloadly]`).

## Infrastructure state (as of 2026-11-03)
- GitHub: `Here001/Almightypumps` (private). `main` = LIVE (fast-forwarded to dev 55d73ca, then 130dee2 provider tools, cdd5cf6 eSIMs,
  757c38f login security, 8e08ee4 legal pages/homepage copy/support@, e42f52c gift cards/airtime/travel eSIMs + email codes, then forgot password + bank/crypto top-ups + admin redesign + supplier-out-of-money queue + sell gift cards & crypto, 2026-11-04, each with the owner's yes); `dev` = day-to-day work. Promote later changes only with an explicit yes.
- Neon: project **almighty-pumps** (`jolly-dust-18900048`, AWS eu-central-1).
  - `main` branch (`br-bitter-feather-ba9z9jv8`): PRODUCTION. Set up 2026-11-04 with owner's yes: 0000–0016
    applied (schema identical to dev), platform wallet created. Config copied from dev: Owlet provider (markup 60%),
    min order ₦1,000, sms_verify markup 200% + fixed prices (WhatsApp ₦4,500, Facebook ₦4,000, Telegram ₦3,500),
    usd auto, Instagram Likes/Live viewers 100% rules. NOT copied: dev's P2P category renamed "Accounts"
    (account sales are blocked); live keeps "Digital products". Re-star 3 TikTok follower services
    (Owlet ids 8277, 24221, 8619) after the first live sync. No users yet (owner signs up, then promote to admin).
  - `dev` branch (`br-dawn-silence-ban4sxrz`): 0000–0024 applied (main too, 2026-11-04 with owner's yes). Provider "Owlet"
    (`https://the-owlet.com/api/v2`, WITH the hyphen; theowlet.com is a different site, NGN, key env `SMM_PROVIDER_1_KEY`, markup 50%, owner
    adjusts it in /admin/providers). Owner's admin account: femiotedola227@gmail.com (signed up on the
    preview 2026-11-03; preview signup, DB and tracking confirmed working).
  - Database name `almighty_pumps`. Use the pooled connection string (host contains `-pooler`).
  - The owner's other Neon projects (Living_Settlement, the-living-world-development)
    belong to a different project. Don't touch them.
- Vercel: team `otedola` (`team_F7GOonVg8RPk8y5ozzjWEsTN`), Hobby plan. Project
  `almightypumps` (`prj_Dn7OhM629JfEts2fr3LVipba0jvc`), linked to the GitHub repo,
  framework Next.js, Node 22, region fra1. Preview env vars set (DATABASE_URL to Neon `dev`,
  DATABASE_SSL, SESSION_SECRET, CRON_SECRET); FLUTTERWAVE_WEBHOOK_HASH; owner adds
  FLUTTERWAVE_SECRET_KEY (test key) and SMM_PROVIDER_1_KEY. Production env vars set 2026-11-04: DATABASE_URL (Neon main pooled),
  DATABASE_SSL, SESSION_SECRET + CRON_SECRET (fresh, different from preview; CRON_SECRET is "encrypted" so the
  owner can copy it for cron-job.org), APP_URL=https://almightypumps.com; owner added FLUTTERWAVE_SECRET_KEY (live),
  FLUTTERWAVE_WEBHOOK_HASH (owner's own value, must match Flutterwave LIVE webhook) and SMM_PROVIDER_1_KEY;
  TEXTVERIFIED_* already there.
- Domain: `almightypumps.com` had lapsed; RE-REGISTERED through Vercel 2026-11-04 (team otedola, $12.03/yr,
  auto-renew on, expires 2027-11-04, registrant Olorunfemi Otedola / Almighty Pumps). DNS is on Vercel
  (ns1/ns2.vercel-dns.com), so records are managed in Vercel. Attached to the project 2026-11-04 (production;
  www redirects 308 to the apex). The cloud sandbox can't resolve the live domain, so the owner checks it. Email: owner chose Zoho Mail (hello@, support@); Zoho (US datacenter, accounts.zoho.com)
  records added in Vercel DNS 2026-11-04: verification TXT, MX mx/mx2/mx3.zoho.com (10/20/50), SPF
  `v=spf1 include:zohomail.com ~all`. Verified in Zoho Mail Admin (old org "VirtualOffice" from ~2021);
  hello@almightypumps.com created 2026-11-04. DKIM TXT `zmail._domainkey` (1024-bit) added 2026-11-04. Owner wants P2P ON at launch (told about the licensed-escrow-partner risk). Flutterwave Test webhook points at the dev preview (with the Vercel
  automation-bypass query param); Live webhook untouched until launch.
- Cron: Hobby only allows daily crons, so `vercel.json` has no `crons` (deploys are refused
  otherwise). The jobs are `GET /api/cron/sync-orders` (every 5 min) and
  `GET /api/cron/escrow` (every 15 min), called with `Authorization: Bearer <CRON_SECRET>`.
  Owner chose **cron-job.org** (2026-11-03); do not re-add `crons` to `vercel.json`.
  Preview jobs call `https://almightypumps-git-dev-otedola.vercel.app` and also send
  `x-vercel-protection-bypass: <automation bypass secret>` (Vercel deployment protection;
  secret is in Vercel > Settings > Deployment Protection, note "cron-job.org scheduler").
  Both preview jobs confirmed working 2026-11-03 (escrow job had been auto-disabled after 302s because
  its bypass header was missing; owner fixed it). A 302 from a job = missing/wrong bypass header.
  At launch, add two more jobs for the production domain with the production CRON_SECRET
  (production domain is not behind Vercel login, so no bypass header).

## Build status
First real build done 2026-11-03: `npm install`, `npm run typecheck`, `npm run lint`,
`npm run build` and `npm test` (21/21) all pass on `dev`. `package-lock.json` is committed.
API routes that read the database must export `dynamic = "force-dynamic"` so the build
never tries to prerender them.
Upgraded 2026-11-03 for security (Next 14 no longer gets fixes): Next 15.5, React 19,
drizzle-orm 0.45, zod 4; `postcss` pinned via `overrides`. `npm audit --omit=dev` is clean.
Next 15 rules: route `params` is a Promise (`const { id } = await params`) and
`cookies()` must be awaited. Remaining audit findings are ESLint 8 dev tooling only;
moving to ESLint 9 / Next 16 is a later job.

## Next tasks, in order
1. ~~Install, type-check, build and fix. Commit to `dev`.~~ Done.
2. ~~Create the Vercel project~~ Done; owner still to add Flutterwave test key and SMM key. Preview env vars:
   `DATABASE_URL` (Neon dev pooled), `DATABASE_SSL=true`, `SESSION_SECRET`, `CRON_SECRET`
   (generate fresh: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
   `FLUTTERWAVE_SECRET_KEY` (owner pastes test key), `FLUTTERWAVE_WEBHOOK_HASH`, `SMM_PROVIDER_1_KEY` (owner pastes).
3. ~~Verify the preview~~ Done: signup, Owlet sync (14.8k services), Flutterwave test top-up
   (₦1,000 credited once, 2026-11-03), cron-job.org sync job running. Webhook delivery not yet
   confirmed: look for `[webhook] flutterwave` in runtime logs (Hobby keeps 1 hour).
   Owlet's API has NO recommended flag (only `mode`/`proof`/`targetable` on 179 in-house
   services); owner chose (2026-11-03) to star manually in /admin/services.
4. Admin panel (`/admin`): ~~Insights~~, ~~providers (markup, sync, balance, pause)~~ done;
   ~~seller verification queue~~ done; ~~disputes, withdrawals, platform wallet~~ done 2026-11-03.
5. Marketplace pages: browse (Bybit P2P-style table, Buy/Sell toggle), listing detail,
   post an ad, trade room (timer, steps, chat, release/dispute), my trades.
6. ~~Rate limiting on auth, funding and order routes.~~ Done 2026-11-03.
7. Mockup Studio, document generator, website templates.

## Going live checklist (owner approval required at each step)
Run the `drizzle/*.sql` migrations on Neon `main`; add Production env vars (live Flutterwave key: the owner also ticked Production when adding the
TEST key and SMM key, so replace FLUTTERWAVE_SECRET_KEY's Production value with the live key,
new webhook hash); set the Flutterwave **Live** webhook to `https://<domain>/api/webhooks/flutterwave`
(it currently points at an old WooCommerce site on almightypumps.com, which the owner
confirmed is no longer in use, so replace it; use a new live secret hash); add the two production
cron-job.org jobs (see Cron above); merge `dev` into `main`.
Legal: escrow should run through a licensed partner in Nigeria before real money.
