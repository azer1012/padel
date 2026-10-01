# Smash Padel

Padel club platform: public site, player app (bookings, open matches, invites,
token wallet, tournaments) and club admin (planning, front-desk bookings, cash
payments, tokens, members, courts, pricing, equipment).

| Package                | What                                                      |
| ---------------------- | --------------------------------------------------------- |
| `artifacts/padel-club` | Website + player app + admin (React 19, Vite, Tailwind 4) |
| `artifacts/api-server` | API (Express 5, Drizzle ORM) — all business rules         |
| `lib/db`               | Drizzle schema shared by the API                          |
| `lib/api-client-react` | Typed React Query client used by the website              |
| `supabase/migrations`  | Database schema, security and integrity rules             |

**Business model**: players pay cash at the club, staff credit tokens.
1 token = 1 player spot for a 90-minute match (25 TND by default).
Book the **full court** (4 tokens, 3 friends join free via an invite link) or
**just your spot** (1 token, others join with a token or pay cash at the club).

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

## Deploy

- `docs/PRODUCTION_SETUP.md`: database, Supabase Auth, SMTP, API, website
- `GOOGLE_AUTH_SETUP.md`: Google sign-in
- `docs/SECURITY.md`: access model and remaining risks
- `docs/OPERATIONS.md`: pricing, equipment, recurring bookings, notifications
- `docs/DESIGN_SYSTEM.md`: UI building blocks
