# Testing

Four layers. The first three run on a developer machine in under a minute; run
them before every release and before rolling a release out to the clubs.

| Layer               | Command                                        | What it proves                                                     |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| Types and lint      | `pnpm run typecheck && pnpm run lint`          | the code and the API tests compile and follow the rules            |
| API integration     | `pnpm --filter @workspace/api-server test`     | every business rule, through the real API and a real Postgres      |
| Database invariants | `pnpm --filter @workspace/scripts run db:test` | the rules the database guarantees even if the API had a bug        |
| Browser             | `pnpm run test:e2e`                            | accounts, bookings, the front desk, failures and every screen size |

`pnpm test` runs the API and database layers together.

## What you need

A **disposable local Postgres 16 or newer** (the hosted projects run 17). The
tests create their own databases, apply `supabase/tests/local-shim.sql` (the
Supabase roles and `auth.users`) plus every migration, and drop the databases at
the end. They never touch a hosted project: `DATABASE_URL` from `.env` is not used.

- Address: `TEST_PG_URL`, default `postgres://postgres@127.0.0.1:54329/postgres`
- The `btree_gist` extension must be available (it ships with standard Postgres)
- `psql` is optional: without it the invariants run through the Node driver
- Works on Windows, macOS and Linux (the tests pin the club time zone themselves)

No Postgres installed? One without an installer:

```bash
mkdir pg-test && cd pg-test && npm init -y && npm i embedded-postgres
BIN=node_modules/@embedded-postgres/*/native/bin
$BIN/initdb -D data -U postgres -A trust -E UTF8 --locale=C
$BIN/pg_ctl -D data -o "-p 54329 -c listen_addresses=127.0.0.1" -l pg.log start
```

## API integration tests (`artifacts/api-server/test`)

The real Express app on a random port, a fresh database per file, and access
tokens signed like Supabase's (`SUPABASE_JWT_SECRET`). No mocks. The harness blanks
the e-mail and push keys, so a provider key in your `.env` never delivers anything
during a test run.

| File                | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.test.ts`       | sign-in and roles, admin endpoints refused to players, token ledger and idempotent credits, full court and own spot, invitations, cash, cancellations and refunds, **10 players racing for one slot**, admin desk bookings, last-admin protection, tournaments                                                                                                                                                                                                                           |
| `settings.test.ts`  | every setting and its validation, a club on 60-minute matches, booking window, weekly hours, holidays, courts and maintenance, cancellation policies, feature switches, personal invitations, packs and cash, notification switches                                                                                                                                                                                                                                                      |
| `access.test.ts`    | **every route of the API, read from the router**: only the public pages answer a visitor, every admin route refuses a player, every write that changes the club's set-up is an admin route; a member never reaches another member's booking, ledger or profile; the calendar never shows a visitor who booked; a cash payment marked twice is audited once                                                                                                                               |
| `hardening.test.ts` | what a member may see of other members, **two simultaneous token debits**, creation times on a server in another time zone, weekly series in club time, equipment availability with the club's match length, input validation of admin forms, the audit trail, **a match stays coherent when a player is taken out** (refund, gear released, organiser handed over, empty match freed, guest bookings kept), notes never erased by an edit, the error contract (`code` on every refusal) |
| `shop.test.ts`      | the boutique: catalogue reserved to admins, **prices and totals decided by the server**, stock taken and given back once, **the last unit sold to one member**, one checkout = one order, a member never reaches another member's order, the steps of an order, the shop switched off                                                                                                                                                                                                    |
| `loyalty.test.ts`   | the loyalty rule: off by default, set by admins only and validated, fractions kept and a whole token credited through the ledger, joins earn and cash does not, **a refund takes the reward back** (booking and cancelling earns nothing), a reward already turned into a token is owed                                                                                                                                                                                                  |
| `integrity.test.ts` | the same booking, cancellation or leave **sent many times at once** happens once (one booking, one debit, one refund); price, payer, owner and role sent by the browser are ignored; forged access tokens (no signature, a project key, another secret); a token credit with an expiry date is refused; **two admins removing each other** leave one admin                                                                                                                               |

Each file ends by checking that the token ledger reconciles
(`token_ledger_audit` is empty).

## Database invariants (`supabase/tests/db-invariants.sql`)

Eleven blocks, each raising on failure: profile created at sign-up, e-mail
change synced, no overlapping bookings, capacity and payment states, the ledger
(unrecorded change refused, append-only, never negative), no browser access for
`anon` and `authenticated`, future tables private by default, legacy schema
gone, settings in range, audit-trail types.

## Browser tests (`scripts/e2e`)

Chromium against the real website, the real API and a throw-away database.
One command builds the API, creates the database (shim, migrations,
`seed.sql`), starts everything on its own ports and stops it at the end:

```bash
pnpm run test:e2e              # every file, a fresh database for each
pnpm run test:e2e booking auth # only the files whose name contains these words
node scripts/e2e/run.mjs --serve   # just start the stack (site on 5199) and leave it running
```

Needs the local Postgres above and Playwright
(`npm i -g playwright axe-core && npx playwright install chromium`, then
`NODE_PATH=$(npm root -g)`). Screenshots and the API log go to
`e2e-screenshots/` (`E2E_LOG_DIR` to change it); a failed step also saves what
each open page was showing (`failed-step-*.png`). Do not edit `.env` while they
run: the website restarts and the pages reload.

| File                 | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.e2e.mjs`       | private pages closed to visitors, sign-up and its validation, the confirmation link (same device, another device, used twice), wrong password, suspended account, safe redirects, session after a reload, sign-out, expired sessions, forgotten password from start to end, profile edits, forged and expired access tokens                                                                                                                                |
| `booking.e2e.mjs`    | the first journey: full court and invite link, own spot, cash at the club, the admin's planning, phone booking, token credit, and the club rules changed in Réglages (60-minute matches, prices, open matches off)                                                                                                                                                                                                                                         |
| `acceptance.e2e.mjs` | the business rules one by one: token credit and ledger, 1 token for a spot and 4 for a court, not enough tokens, a taken slot, **two members and two browsers on the same slot**, invitations (accept, decline, twice, full match), open matches, mixed payments, cancellations and the deadline, courts, maintenance, opening hours, closed days, prices, time zones, notifications sent once, the reminder job, and the state of the database at the end |
| `resilience.e2e.mjs` | the API down, slow or answering errors; a lost booking request; Confirm pressed again and again; malformed requests; reload, back and forward; a whole booking on a phone; keyboard only                                                                                                                                                                                                                                                                   |
| `shop.e2e.mjs`       | the boutique from both sides: the admin adds articles, a member fills a cart and orders without paying, the desk sees who to call and moves the order on, stock, a phone, the shop switched off                                                                                                                                                                                                                                                            |
| `screens.e2e.mjs`    | every page for a visitor, a player and an admin at 320, 375, 390, 414, 768, 1024, 1280 and 1440 px (nothing cut off, no sideways scroll, no broken image, no error in the console), dialogs on a 320 px phone, Arabic right-to-left, the WCAG A/AA rules of axe-core, and how many requests each page sends                                                                                                                                                |

Supabase Auth itself can't run offline and must never receive test sign-ups, so
`auth-stub.mjs` stands in for it: same endpoints, same answers and error codes,
access tokens signed with the API's `SUPABASE_JWT_SECRET`. The forms, the session
handling and every API check are the production code; what it cannot prove is
listed below.

## What only the real site can prove

Do these by hand on each club's deployment (`docs/PRODUCTION_DEPLOYMENT.md` §5):
sign-up with e-mail confirmation, password reset, Google sign-in, the e-mails
actually arriving, push notifications on a phone.

A read-only check that the hosted database is closed to browsers (replace the two values):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<project-ref>.supabase.co/rest/v1/users?select=*" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"     # must print 401
```
