# Almighty Pumps

Create, sell and grow from one Naira wallet. Phase 1 of the platform: accounts,
wallet, Paystack funding, social-growth reselling, an escrow-protected P2P
marketplace, a reseller API, and the 3D homepage.

## What's in this phase

| Area | Status |
| --- | --- |
| 3D homepage (WebGL world, liquid glass, smooth scroll) | Built |
| Sign up, log in, sessions | Built |
| Wallet with ledger, holds and idempotent credits | Built |
| Paystack top-ups (checkout, webhook, verify on return) | Built |
| Withdrawals (request + admin marks paid or rejects) | Built, payout is manual |
| Social growth: provider sync, priced catalogue, orders, auto status sync | Built |
| Pay-on-delivery for growth orders (hold, then capture or refund) | Built |
| P2P listings with banned-item filter | Built (API) |
| Escrow trades: pay, ship, confirm, dispute, cancel, auto-release, auto-cancel | Built (API) |
| Trade chat and timeline | Built (API) |
| Admin: verify sellers, resolve disputes, decide withdrawals, add/sync providers | Built (API) |
| Reseller API (`/api/v2`, standard panel format) and API keys | Built |
| Dashboard: balance, fund wallet, quick order, orders, trades, activity | Built |
| Marketplace pages, trade room page, admin pages | Next phase (APIs are ready) |
| Mockup studio, business documents, website templates | Next phase |
| Automatic payouts (Paystack Transfers), seller KYC provider | Next phase |

## Run it locally

You need Node.js 22.6 or newer and a PostgreSQL 14+ database
(a free [Neon](https://neon.tech) or Supabase database works).

```bash
npm install
cp .env.example .env        # then fill in the values
npm run db:migrate          # creates the tables and the platform wallet
npm run db:seed             # creates your admin account and an example provider row
npm test                    # 21 tests for money, wallet, escrow, pricing, payments, listing rules
npm run dev                 # http://localhost:3000
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Deploy (Vercel + Neon)

1. Push this folder to a GitHub repository.
2. Create a Neon database and copy its connection string.
3. Import the repo in Vercel. Add every variable from `.env.example`
   (`DATABASE_SSL=true` for Neon; `APP_URL` = your live URL).
4. Run `npm run db:migrate` and `npm run db:seed` once against the live database
   (from your computer with the live `DATABASE_URL` in `.env`).
5. `vercel.json` schedules two jobs. Vercel sends `Authorization: Bearer $CRON_SECRET`
   automatically when `CRON_SECRET` is set:
   - `/api/cron/sync-orders` every 5 minutes: checks growth orders and charges or refunds.
   - `/api/cron/escrow` every 15 minutes: auto-releases inspected trades and refunds undelivered ones.
   Vercel's Hobby plan only runs crons once a day; use the Pro plan or an external
   scheduler (cron-job.org) calling those URLs with the same header.

## Set up payments (Paystack)

1. Paystack dashboard → Settings → API Keys & Webhooks.
2. Put the secret key in `PAYSTACK_SECRET_KEY`.
3. Set the webhook URL to `https://YOUR-DOMAIN/api/webhooks/paystack`.

A top-up is only credited after the server re-verifies the transaction with
Paystack, the amount matches, and the reference hasn't been used before.

## Set up a social-growth provider

1. Log in as the admin (from `db:seed`).
2. Add the provider (or edit the seeded row):
   ```bash
   curl -X POST https://YOUR-DOMAIN/api/admin/providers \
     -H "Content-Type: application/json" -b "ap_session=..." \
     -d '{"name":"Provider 1","apiUrl":"https://PROVIDER-API-URL","apiKeyEnv":"SMM_PROVIDER_1_KEY","currency":"NGN","fxKoboPerUnit":100,"markupBps":3000}'
   ```
   - `apiKeyEnv` is the **name** of the environment variable holding the provider key.
     The key itself never goes in the database.
   - `fxKoboPerUnit`: 100 for a Naira provider; for a USD provider at ₦1,600/$, use 160000.
   - `markupBps`: your markup in basis points. 3000 = 30%.
3. Import the catalogue and prices: `POST /api/admin/providers/{id}/sync`.
   Re-run it whenever the provider changes prices.

## How the money works

- All amounts are integer **kobo**. No floats anywhere.
- Each wallet has `available` and `held`. Every change writes a ledger line with
  the balance after it, so you can audit any wallet.
- Wallet rows are locked (`SELECT … FOR UPDATE`) inside a transaction for every
  change, always in id order, so two requests can't spend the same money.
- **Growth orders:** the cost is held, sent to the provider, then charged in full
  (completed), in part (partial delivery) or refunded (cancelled or rejected).
- **Escrow:** the buyer's payment is held. On confirmation or auto-release the
  seller receives the amount minus a 3% fee, credited to the platform wallet.
  On cancellation or a buyer-side dispute ruling the hold is released back.
- The platform wallet (created by the migration) collects fees and growth revenue.

Business rules live in `src/core/` as pure functions with tests, so you can change
fees, timers or pricing in one place:

- `escrow.ts` – trade states, who can do what, deadlines (72h to ship, 48h to inspect), 3% seller fee
- `smm.ts` – pricing with FX and markup, order cost, partial-delivery charging, provider parsing
- `ledger.ts` / `money.ts` – wallet arithmetic and naira formatting
- `listingPolicy.ts` – categories and banned items (accounts, ID/financial documents, counterfeits, weapons, drugs, card data, gift cards/crypto)

## API reference (all JSON, session cookie auth)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{name, email, phone?, password}` |
| POST | `/api/auth/login` | `{email, password}` |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | User, wallet and latest 30 movements |
| POST | `/api/wallet/fund` | `{amount}` in naira → Paystack checkout URL |
| POST | `/api/wallet/verify` | `{reference}` confirm after redirect |
| POST | `/api/wallet/withdraw` | `{amount, bankCode, accountNumber, accountName}` |
| GET | `/api/smm/services` | Priced catalogue |
| GET/POST | `/api/smm/orders` | List / `{service, link, quantity}` |
| GET/POST | `/api/market/listings` | Browse (`?category=`) / create (verified sellers) |
| POST | `/api/market/listings/{id}/buy` | `{quantity}` opens an escrow trade |
| GET | `/api/market/trades` | My trades |
| GET/POST | `/api/market/trades/{id}/messages` | Trade room / send a message |
| POST | `/api/market/trades/{id}/action` | `{action: SHIP|CONFIRM|DISPUTE|CANCEL, note?, deliveryProof?}` |
| POST | `/api/seller/apply` | Request seller verification |
| GET/POST | `/api/keys` | Reseller API keys (shown once) |
| POST | `/api/v2` | Reseller API: `key`, `action=services|add|status|balance` |
| POST | `/api/admin/sellers/{userId}` | `{decision: verified|rejected}` |
| POST | `/api/admin/trades/{id}` | `{action: RESOLVE_BUYER|RESOLVE_SELLER|CANCEL}` |
| POST | `/api/admin/withdrawals/{id}` | `{decision: paid|rejected}` |
| GET/POST | `/api/admin/providers` | List / add providers |
| POST | `/api/admin/providers/{id}/sync` | Import services and prices |

## Before you take real money

- **Escrow licensing.** Holding other people's money for third parties is
  regulated in Nigeria. Talk to a lawyer and run escrow balances through a
  licensed partner (for example a payment provider's escrow or split-settlement
  product) before launch. The ledger here is built so you can swap the money
  rail without changing the business rules.
- **Seller verification.** Replace the manual admin check with a KYC provider
  (Smile ID, Dojah, Prembly) and require a verified bank account.
- **Social platforms' rules.** Buying engagement breaks Instagram, TikTok and
  YouTube terms. Say so in your terms of service and refund policy.
- Add rate limiting (for example Upstash) on auth, funding and order routes.

## Project layout

```
app/                 Pages and API routes (Next.js App Router)
src/core/            Pure business rules + tests (no dependencies)
src/server/          Database, wallet, market, growth orders, payments, auth
src/landing/         3D homepage markup and effects
src/components/      Client components (forms, dashboard actions)
drizzle/0000_init.sql  Database schema
scripts/             migrate.mjs, seed.mjs
tests/core.test.ts   Unit tests (run with `npm test`)
```
