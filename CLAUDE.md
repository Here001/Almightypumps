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

Hard limits agreed with the owner: no fake/forged documents (IDs, passports, bank
statements, utility bills, payslips), no selling social media/gaming accounts,
no counterfeit goods. `src/core/listingPolicy.ts` enforces this on listings.

## Stack
Next.js 15.5 (App Router) + React 19 + TypeScript, PostgreSQL on Neon via drizzle-orm + pg,
jose sessions, bcryptjs, zod 4, Flutterwave (payments; switched from Paystack 2026-11-03), three.js/gsap/lenis for the 3D homepage.
Hosting on Vercel (functions in `fra1` next to the Frankfurt database).

## Layout
- `src/core/` pure business rules with no dependencies: money (integer kobo), ledger,
  escrow state machine, SMM pricing/parsing, listing policy, crypto helpers.
  Tested by `tests/core.test.ts` (`npm test`, Node's built-in runner, 25 tests).
- `src/server/` database access, wallet (row locks, holds, idempotent ledger),
  market, smm, payments (Flutterwave), auth, env, http helpers.
- Customer dashboard (`app/dashboard` → `src/components/dashboard/`): tabs Services / Orders /
  Wallet / P2P (URL hash; bottom tab bar on phones). Services = hub of service tiles from
  `src/components/dashboard/services.ts` (Boost Account live; eSIMs, Get Verification Code
  "coming soon"). Boost Account (#boost) = all SMM/Owlet services: search + platform tiles +
  kind chips + paged service cards (recommended first, then cheapest) + order sheet.
  "Recommended" = provider flag (`provider_recommended`, detected by `isProviderRecommended`;
  sync logs the provider's field names as `[provider] … service fields`) OR admin star
  (`featured`, /admin/services, kept across syncs). Owner asked for a "Buy Account" tile:
  not built (selling social/gaming accounts is one of the owner's hard limits). Catalogue data comes from
  `smm_services.platform/kind/display_name`, set at sync by `src/core/catalog.ts`.
- **Service policy:** `isRestricted` in `src/core/catalog.ts` keeps fake reviews/ratings,
  contest/broadcast/website voting (BBNaija, radio/TV, "IP votes") and fake add-to-carts out
  of the store (hidden at sync). 2026-11-03: owner asked to sell these; agreed to allow
  social-media poll votes only (kind "Poll votes"); Claude declined to enable fake reviews,
  contest votes and add-to-carts (third-party deception, FCCPC/FTC risk, payment-provider risk).
- `app/api/**` route handlers; `app/page.tsx` 3D homepage; `app/signup`, `app/login`,
  `app/dashboard`; `app/admin` (Insights, Growth providers, Services, Pricing; admins only).
- Pricing (`src/server/pricing.ts`, /admin/pricing): markup = most specific of
  `smm_pricing_rules` platform+kind → platform (kind NULL) → provider `markup_bps`.
  `reprice()` recomputes `rate_kobo` in SQL (same maths as `sellRatePer1000`); called after
  rule changes, provider markup changes and every sync. Minimum order amount lives in
  `app_settings.min_order_kobo` (0 = none), enforced in `placeOrder` (web + /api/v2) and
  shown in the order sheet.
- Dollar display: `app_settings.usd_rate_kobo` (kobo per US$1, set in /admin/pricing; 0 = off).
  Display only: wallet, top-ups and charges stay in Naira. Customer ₦/$ switch
  (`src/components/dashboard/Currency.tsx`, remembered in localStorage); formatting in
  `src/core/currency.ts`. Charged amounts always show Naira (`charge()`), with ≈$ alongside.
- Service visibility: `smm_services.hidden_reason` null = on sale, `admin` (hidden in
  /admin/services, survives syncs), `policy` (isRestricted; can't be unhidden), `provider`
  (dropped upstream or 0-priced; returns on next sync if listed). `active` mirrors it.
- Insights: `src/components/Tracker.tsx` beacons each page and dashboard #section to
  `/api/track` → `site_events` (anonymous cookie id, no IP/UA stored). Section names come
  from `src/core/analytics.ts` (add new pages there). Queries in `src/server/insights.ts`.
- `src/landing/` homepage markup + effects ported from the approved prototype.
- `drizzle/*.sql` migrations, applied in order by `scripts/migrate.mjs` (tracked in `_migrations`);
  `src/server/db/schema.ts` mirrors them. New schema change = new numbered file + schema.ts.
- `scripts/migrate.mjs`, `scripts/seed.mjs`.

## Infrastructure state (as of 2026-11-03)
- GitHub: `Here001/Almightypumps` (private). `main` (placeholder README only) and
  `dev` (full app) are both pushed.
- Neon: project **almighty-pumps** (`jolly-dust-18900048`, AWS eu-central-1).
  - `main` branch: production, still empty. Run the migration on it only after approval.
  - `dev` branch (`br-dawn-silence-ban4sxrz`): 0000–0005 applied. Provider "Owlet"
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
  FLUTTERWAVE_SECRET_KEY (test key) and SMM_PROVIDER_1_KEY. Production env vars are added only when going live.
- Domain: owner owns `almightypumps.com` (old WooCommerce site there is retired); likely
  launch domain. Flutterwave Test webhook points at the dev preview (with the Vercel
  automation-bypass query param); Live webhook untouched until launch.
- Cron: Hobby only allows daily crons, so `vercel.json` has no `crons` (deploys are refused
  otherwise). The jobs are `GET /api/cron/sync-orders` (every 5 min) and
  `GET /api/cron/escrow` (every 15 min), called with `Authorization: Bearer <CRON_SECRET>`.
  Owner chose **cron-job.org** (2026-11-03); do not re-add `crons` to `vercel.json`.
  Preview jobs call `https://almightypumps-git-dev-otedola.vercel.app` and also send
  `x-vercel-protection-bypass: <automation bypass secret>` (Vercel deployment protection;
  secret is in Vercel > Settings > Deployment Protection, note "cron-job.org scheduler").
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
3. ~~Verify the preview: sign up, dashboard loads, wallet shows ₦0.00.~~ Done. Still to test:
   Owlet sync from /admin/providers, a Flutterwave test top-up.
4. Admin panel (`/admin`): ~~Insights~~, ~~providers (markup, sync, balance, pause)~~ done;
   still to do: seller verification queue, disputes, withdrawals, platform wallet balance.
5. Marketplace pages: browse (Bybit P2P-style table, Buy/Sell toggle), listing detail,
   post an ad, trade room (timer, steps, chat, release/dispute), my trades.
6. Rate limiting on auth, funding and order routes.
7. Mockup Studio, document generator, website templates.

## Going live checklist (owner approval required at each step)
Run the `drizzle/*.sql` migrations on Neon `main`; add Production env vars (live Flutterwave key: the owner also ticked Production when adding the
TEST key and SMM key, so replace FLUTTERWAVE_SECRET_KEY's Production value with the live key,
new webhook hash); set the Flutterwave **Live** webhook to `https://<domain>/api/webhooks/flutterwave`
(it currently points at an old WooCommerce site on almightypumps.com, which the owner
confirmed is no longer in use, so replace it; use a new live secret hash); add the two production
cron-job.org jobs (see Cron above); merge `dev` into `main`.
Legal: escrow should run through a licensed partner in Nigeria before real money.
