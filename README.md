# Padel club platform

Reusable product, sold one club at a time: public site, player app (bookings,
open matches, invitations, token wallet, tournaments) and club admin (planning,
front-desk bookings, cash payments, tokens, members, courts, settings, pricing,
equipment).

**One installation = one club**: one codebase, one Supabase project and one
deployment per customer. No multi-tenancy, no shared customer data. Branding
(name, logo, colours, photos) is set per installation at build time; operational
rules (courts, duration, players, prices, tokens, hours, features,
notifications) are edited by the club in **Admin → Réglages**.

| Package                | What                                                      |
| ---------------------- | --------------------------------------------------------- |
| `artifacts/padel-club` | Website + player app + admin (React 19, Vite, Tailwind 4) |
| `artifacts/api-server` | API (Express 5, Drizzle ORM) — all business rules         |
| `lib/db`               | Drizzle schema shared by the API                          |
| `lib/api-client-react` | Typed React Query client used by the website              |
| `supabase/migrations`  | Database schema, security and integrity rules             |

**Business model**: players pay cash at the club, staff credit tokens (packs or
single tokens). Players book the **full court** (the booker pays every spot,
invited friends join free) or **just their spot** (others join with a token or
pay cash at the club). Defaults: 90-minute matches, 4 players, 25 TND per player,
1 token per spot / 4 per court, all changeable in Réglages.

## Develop

Node 20+ and pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env      # fill in the Supabase keys and DATABASE_URL
pnpm dev                  # API + website on http://localhost:5173 (/api proxied)
pnpm dev:demo             # website only, on an in-memory demo club
```

## Check

```bash
pnpm run typecheck
pnpm run lint
pnpm --filter @workspace/api-server test        # API integration tests
pnpm --filter @workspace/scripts run db:test    # database invariants
pnpm run build
```

The tests need a disposable local Postgres 16+ (`TEST_PG_URL`, default
`postgres://postgres@127.0.0.1:54329/postgres`). They create and drop their
own databases. `scripts/e2e/booking.e2e.mjs` runs the full player + admin
journey in Chromium against a running stack.

## New club, deploy, operate

| Guide                               | What                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `docs/NEW_CUSTOMER_SETUP.md`        | Onboard a new club, in 7 phases (start here)           |
| `docs/SUPABASE_NEW_CUSTOMER.md`     | Create and configure the club's Supabase project       |
| `docs/CONFIGURATION.md`             | What is `.env`, what is branding, what is Réglages     |
| `docs/PRODUCTION_DEPLOYMENT.md`     | Database, API server, website hosting, final checks    |
| `docs/DOMAIN_SETUP.md`              | Domain, DNS, HTTPS                                     |
| `docs/EMAIL_CONFIGURATION.md`       | Auth e-mails (SMTP) and the API's notification e-mails |
| `docs/GOOGLE_AUTH_CONFIGURATION.md` | Google sign-in (Apple prepared)                        |
| `docs/DATABASE.md`                  | Tables, rules enforced by the database, migrations     |
| `docs/DATABASE_DIAGRAM.md`          | Entity-relationship diagram                            |
| `docs/SECURITY.md`                  | Access model, secrets, remaining risks                 |
| `docs/OPERATIONS.md`                | Pricing, equipment, recurring bookings, notifications  |
| `docs/DESIGN_SYSTEM.md`             | UI building blocks                                     |
