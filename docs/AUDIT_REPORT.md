# Production audit — Smash Padel (October 2026)

## Executive summary

**Status: code ready, launch blocked on 4 actions only you can do.** Until the
first one is done, the live site can't work and the live database is insecure.

1. **Apply the database migrations to the hosted project** (one paste in the SQL
   editor, `docs/PRODUCTION_SETUP.md` §1). Two attempts from this session were
   cancelled at the approval prompt, so nothing has been applied live.
2. **Configure custom SMTP** in Supabase Auth: real players won't receive
   confirmation or reset e-mails otherwise.
3. **Choose the production domain** and set Site URL, redirect URLs and the
   `VITE_SITE_URL` / `FRONTEND_URL` / `CORS_ORIGIN` variables.
4. **Deploy** the API (Node host) and the website, with the variables of `.env.example`.

Google sign-in is optional and ready to switch on (`GOOGLE_AUTH_SETUP.md`).

What the audit found on the live project `bnbdeymvdfrklbegwfgd`: a **different,
empty schema** (UUID `profiles / courts / reservation_payments`, 5 migrations
from 2026-06-29 that aren't in the repository) that the application cannot run
against, with critical holes:

- any signed-in user could set their own `token_balance` or `role = 'admin'`;
- every profile (e-mail, phone, balance) was readable without logging in;
- anyone could insert reservations without paying.

You chose to replace it with the repository's schema. It's empty (0 rows,
0 auth users, 0 files), so no data is lost.

## Fixed

### Booking and token logic (critical)

- **Overlapping bookings** were possible (only identical start times were
  blocked). The database now rejects any overlap (exclusion constraint), and the
  API answers `409 SLOT_TAKEN` with no token charged.
- **Every restart converted guest phone bookings and maintenance blocks into
  joinable "own spot" matches** (startup "migration" + calendar heuristic), so the
  court could be sold twice. Removed.
- **Admins could cancel through `PATCH status=cancelled` without refunding** anyone.
  Refused now; cancellation always goes through the refunding path.
- **Players could cancel after the match was played** and get their tokens back.
  Cancelling is closed once the match starts (or `CANCELLATION_NOTICE_HOURS` before).
- **Admins could set a token-paid spot back to "pending"/"refunded" by hand**,
  desynchronising the ledger. Only cash spots can be marked by hand now.
- **Full court didn't allow inviting the 3 friends** (invites were refused). Now
  the booker shares one link / WhatsApp / QR code and friends join as `invited_free`.
- **Own spot**: others join with a token **or reserve and pay cash at the club**
  (`cash_club / pending`), staff tick it paid. 1/4 → 4/4 is enforced by a database trigger.
- Per-player payment states: `token`, `cash_club`, `invited_free` × `paid / pending / refunded`.
- Last player leaving an own-spot match frees the court. The organiser role passes
  to the next player if the organiser leaves.
- Bookings must sit on the court's 90-minute grid and opening hours.
- Token ledger: single `moveTokens()` helper, append-only ledger, deferred
  database check that every balance change has a ledger entry, idempotency key
  against double credits.
- Tournament registration: capacity, duplicates and concurrency handled
  (was unlimited and crashed on duplicates).

### Security

- Browser roles revoked from every table (also future tables). All permissive
  RLS policies dropped. Realtime publication emptied. Unused storage write
  policies dropped. `SECURITY DEFINER` functions no longer callable by `anon`.
- Undeployed edge function `token-processing` (any signed-in user could credit
  themselves) removed with the other unused functions.
- Rollback SQL files moved out of `migrations/`: they shared the migrations'
  version numbers and could have been run by the Supabase CLI.
- Uniform `{ error, code }` responses without internals, input validation and
  length limits, 100 kB body limit, per-IP write rate limit, security headers,
  graceful shutdown.
- Demo mode (fake club, fake auth) was shipped in the production bundle. It's now
  compiled only into demo builds.
- Production dependencies: `pnpm audit --prod` reports no known vulnerabilities
  (was 4). Dev tooling patched (orval with 11 critical RCE advisories removed).

### Authentication

- Sign-up collects first name, last name, phone (optional). The profile is created
  by a database trigger at signup (no more race with the first API calls).
- Password reset had no page to set the new password. Added `/reset-password`.
- Translated, human error messages. "Resend confirmation e-mail". Errors coming
  back from OAuth redirects are displayed.
- The Apple button (never configured) was removed. Google appears only when
  `VITE_AUTH_GOOGLE_ENABLED=true`.
- Profile edits are no longer overwritten by the sign-in sync.
- Optional local JWT verification (`SUPABASE_JWT_SECRET`) removes a network call
  to Supabase Auth on every API request.

### UX / UI

- Planning: **courts as columns, 90-minute rows**, sticky time column and court
  header, horizontal swipe on phones with equal columns, the grid above the fold
  on mobile, legend, peak and open-match markers, auto-scroll to the next slot,
  tomorrow shown when today is over.
- Booking in 3 taps: slot → full court / my spot → confirm → **success screen with
  invite link, WhatsApp, native share and a locally generated QR code**.
- Match dialog: players with payment badges, empty seats ("paid spot for a friend"
  vs "open spot"), join by token or cash, invite, leave, cancel with confirmation.
- A slot taken meanwhile closes the dialog with "no token was charged".
- **All match times in club time (Africa/Tunis)**: a phone set to another timezone
  showed shifted times.
- My bookings: Cancel for the organiser, Leave for joined players, own payment
  badge, real player count, inline invite.
- Invite page: "your spot is free" for full-court friends, token or cash otherwise.
- Admin: front-desk booking on the grid (member with tokens or cash, phone guest),
  mark cash paid, add/remove players with member search, block a slot, new-booking
  dialog on the court grid, role management, token dialog with member search
  (the list was capped at 200 members). A misleading "tokens expire on" field was
  removed (nothing expires tokens).
- Placeholder contact details (fake phone number, `#` social links) replaced by
  `VITE_CLUB_*` variables. Empty channels are hidden.

### Architecture & code quality

- 8 dead modules, 38 unused UI components, 31 unused dependencies, 13 MB of unused
  images, Replit leftovers (`.agents`, `attached_assets`, aliases, ignores) removed.
- Duplicate auth helpers, unused transaction wrapper and `terrain-slots` endpoint removed.
- ESLint 10 (TypeScript + React hooks) set up and clean. The old config couldn't
  parse TypeScript.
- Dashboard numbers computed from real courts and prices (were hardcoded:
  20 slots/day, 100 TND per booking, UTC peak hours).
- SEO from `VITE_SITE_URL`: canonical, absolute OG image, JSON-LD, sitemap, robots
  (private pages disallowed).
- Migrations are the single schema source (`drizzle-kit push` removed), the runner
  writes the Supabase CLI history table, and `db:bundle` produces the one-time script.

## Database (after the migrations)

| Area        | State                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables      | users, terrains, reservations, reservation_players, player_invites, token_transactions, notifications, tournaments, tournament_registrations, news, activity, clubs, staff_roles, pricing_rules, equipment_items, reservation_equipment, reservation_series, push_subscriptions, notification_log. The requested `open_matches` is a view over `reservations` (`is_public`); `reservation_payments` is covered by the per-player payment columns. |
| Constraints | overlap exclusion, capacity trigger, unique player per match, non-negative balances, ledger triggers, idempotency key                                                                                                                                                                                                                                                                                                                             |
| Indexes     | foreign keys and hot paths (status/start, reservation, user, admin, invites…)                                                                                                                                                                                                                                                                                                                                                                     |
| RLS         | on for every table, no policies, browser roles revoked                                                                                                                                                                                                                                                                                                                                                                                            |
| Functions   | `search_path` pinned, execute revoked from public roles                                                                                                                                                                                                                                                                                                                                                                                           |
| Triggers    | signup → profile, e-mail change sync, capacity, ledger, append-only                                                                                                                                                                                                                                                                                                                                                                               |
| Realtime    | nothing published (the app polls every 30 s and on focus)                                                                                                                                                                                                                                                                                                                                                                                         |
| Storage     | 5 public buckets kept, no browser write or listing policies                                                                                                                                                                                                                                                                                                                                                                                       |

## Tests (actual results in this session)

| Suite                                                                            | Result                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                                                             | 0 errors                                                                                                                                                                                 |
| `pnpm run lint`                                                                  | 0 problems                                                                                                                                                                               |
| API integration (`artifacts/api-server/test`, real Postgres 16 + all migrations) | **38 / 38 passed** (auth, tokens, reservations incl. a 10-way race for one slot, full-court invites, own-spot 1/4→4/4, cash payments, cancellation and refunds, admin desk, tournaments) |
| Database invariants (`supabase/tests/db-invariants.sql`)                         | **10 / 10 passed**                                                                                                                                                                       |
| Browser E2E (`scripts/e2e/booking.e2e.mjs`, Chromium)                            | **19 / 19 passed** (player, invited friend on mobile, cash player, admin, public mobile pages). Ledger reconciled afterwards.                                                            |
| One-time live script dry-run on a copy of the live legacy state                  | applied, history correct, invariants 10/10                                                                                                                                               |
| `pnpm run build`                                                                 | succeeds, no warnings                                                                                                                                                                    |
| `pnpm audit --prod`                                                              | no known vulnerabilities                                                                                                                                                                 |

**Not testable from this session**: anything that needs the hosted project or
real e-mail. Signup e-mails, e-mail verification, password-reset e-mails, Google
OAuth, and the API against the live database (the session's network blocks
`*.supabase.co`, and the migrations weren't approved). These are on the checklist below.

## Remaining configuration

| What                                                                                          | Where                                       | Doc                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------- |
| Apply migrations                                                                              | Dashboard → SQL Editor (`db:bundle` output) | PRODUCTION_SETUP §1  |
| Production domain                                                                             | your registrar / host                       | —                    |
| Site URL + redirect URLs                                                                      | Auth → URL Configuration                    | PRODUCTION_SETUP §2  |
| SMTP host, user, password, sender                                                             | Auth → Emails → SMTP                        | PRODUCTION_SETUP §2  |
| Google Client ID + secret                                                                     | Google Cloud → Supabase Auth → Google       | GOOGLE_AUTH_SETUP.md |
| Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY`, `CRON_SECRET`, VAPID) | API host env                                | `.env.example`       |
| Club phone / WhatsApp / e-mail / socials                                                      | website build env (`VITE_CLUB_*`)           | `.env.example`       |
| First admin                                                                                   | SQL editor                                  | PRODUCTION_SETUP §1  |
| CAPTCHA (recommended)                                                                         | Auth → Attack Protection + site key         | SECURITY.md          |
| Mobile: installable PWA works as is; no native app in this repo                               | —                                           | —                    |

## Decisions for you

- **Cash already paid for a cancelled match**: the token spots are refunded
  automatically, but a `cash_club / paid` spot stays as is. Staff refund at the
  desk (or credit tokens). Decide the policy and it can be automated.
- **Cancellation deadline**: currently "until the match starts"
  (`CANCELLATION_NOTICE_HOURS=0`). Many clubs use 12–24 h.
- **No-shows on cash spots**: holding a spot "pay at the club" costs nothing up front.

## Production checklist

- [x] Production build succeeds
- [x] No TypeScript errors
- [x] No ESLint errors
- [x] No broken routes or imports (build + 19-step browser run, 404 page checked)
- [ ] Supabase connection works with the production database (blocked: migrations not applied, network blocked here)
- [ ] Authentication works end to end with real e-mails (needs SMTP)
- [x] RLS / access model secure — verified on a local copy with the exact migrations
- [ ] RLS secure **on the live project** (needs the migrations applied)
- [x] Reservations work (API + browser tests, local)
- [x] Token accounting works and reconciles (API + browser tests, local)
- [x] No double booking (10-way race, overlap constraint)
- [x] Mobile responsive (375–390 px screenshots, no horizontal overflow)
- [x] Desktop responsive (1366 px)
- [x] Production environment documented (`.env.example`, PRODUCTION_SETUP.md)
- [x] E-mail configuration documented
- [x] Google login configuration documented
- [ ] Google login tested (needs your Google client)
- [x] No Replit dependency
- [x] No secrets committed
- [ ] Production domain chosen and configured
- [ ] SMTP configured
- [ ] First admin created
