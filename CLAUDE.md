# Almighty Pumps: project briefing for Claude Code

## Owner rules (always follow)
- **Ask the owner before anything goes live.** Never push to `main`, merge into `main`,
  promote a Vercel deployment to production, or change the Neon `main` branch without
  an explicit "yes" in the conversation.
- Day-to-day work goes on the `dev` branch. Vercel builds every `dev` push as a
  private preview. Send the owner the preview link and ask before promoting.
- Never put secrets (database passwords, Paystack keys, provider API keys,
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
jose sessions, bcryptjs, zod 4, Paystack, three.js/gsap/lenis for the 3D homepage.
Hosting on Vercel (functions in `fra1` next to the Frankfurt database).

## Layout
- `src/core/` pure business rules with no dependencies: money (integer kobo), ledger,
  escrow state machine, SMM pricing/parsing, listing policy, crypto helpers.
  Tested by `tests/core.test.ts` (`npm test`, Node's built-in runner, 21 tests).
- `src/server/` database access, wallet (row locks, holds, idempotent ledger),
  market, smm, payments (Paystack), auth, env, http helpers.
- `app/api/**` route handlers; `app/page.tsx` 3D homepage; `app/signup`, `app/login`,
  `app/dashboard`.
- `src/landing/` homepage markup + effects ported from the approved prototype.
- `drizzle/0000_init.sql` schema (mirrors `src/server/db/schema.ts`; change both).
- `scripts/migrate.mjs`, `scripts/seed.mjs`.

## Infrastructure state (as of 2026-11-03)
- GitHub: `Here001/Almightypumps` (private). `main` (placeholder README only) and
  `dev` (full app) are both pushed.
- Neon: project **almighty-pumps** (`jolly-dust-18900048`, AWS eu-central-1).
  - `main` branch: production, still empty. Run the migration on it only after approval.
  - `dev` branch (`br-dawn-silence-ban4sxrz`): schema 0000_init.sql applied.
  - Database name `almighty_pumps`. Use the pooled connection string (host contains `-pooler`).
  - The owner's other Neon projects (Living_Settlement, the-living-world-development)
    belong to a different project. Don't touch them.
- Vercel: team `team_F7GOonVg8RPk8y5ozzjWEsTN`. Project `almighty-pumps` not created yet.
  Plan: link to the GitHub repo, framework Next.js, region fra1, Preview env vars pointing
  at the Neon `dev` branch, Production env vars added only when going live.

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
2. Create the Vercel project with preview env vars:
   `DATABASE_URL` (Neon dev pooled), `DATABASE_SSL=true`, `SESSION_SECRET`, `CRON_SECRET`
   (generate fresh: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
   `PAYSTACK_SECRET_KEY` (owner pastes test key), `SMM_PROVIDER_1_KEY` (owner pastes).
3. Verify the preview: sign up, dashboard loads, wallet shows ₦0.00.
4. Admin panel (`/admin`): seller verification queue, disputes, withdrawals,
   providers with a "Sync services" button, platform wallet balance.
5. Marketplace pages: browse (Bybit P2P-style table, Buy/Sell toggle), listing detail,
   post an ad, trade room (timer, steps, chat, release/dispute), my trades.
6. Rate limiting on auth, funding and order routes.
7. Mockup Studio, document generator, website templates.

## Going live checklist (owner approval required at each step)
Run `drizzle/0000_init.sql` on Neon `main`; add Production env vars (live Paystack key);
set the Paystack webhook to `https://<domain>/api/webhooks/paystack`; decide on Vercel Pro
or cron-job.org for the two cron jobs in `vercel.json`; merge `dev` into `main`.
Legal: escrow should run through a licensed partner in Nigeria before real money.
