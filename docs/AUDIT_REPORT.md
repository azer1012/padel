# Audit and hardening report — reusable padel club product

Five passes on `main`: (1) production audit and hardening of the platform,
(2) turning it into a reusable product sold one club at a time, with every
operational rule configurable by the club, (3) a full re-audit against the code
and the live database (2026-10-02), (4) a code-level review and refactor
(2026-10-02), (5) an end-to-end verification pass (2026-10-02). This report
covers the current state.

## Pass 5 (2026-10-02): end-to-end verification

Re-read the booking, token, invitation, calendar and sign-in code, re-ran every
suite, and compared the hosted database with the migrations column by column,
constraint by constraint and index by index: identical, except `users.gender`
(below). Hosted data: ledger reconciled, no negative balance, no overlap, no orphan
row; REST, RPC and Storage calls with the public key all refused.

No P0 / P1 found. Fixed:

| Found                                                                                                                              | Now                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Token expiry was half-built: a credit could carry an expiry date and the member was told "these tokens expire on…", nothing did it | Tokens never expire: the API refuses an expiry date, the e-mail line and the dead screens went |
| Two admins removing each other's admin access at the same instant could leave the club without an admin                            | Checked under a lock, tested                                                                   |
| Wallet and token history showed the API's English wording ("Full court · …") in French and Arabic, with a French date for everyone | Shown in the reader's language; the stored date is numeric (`03/10/2026 18:30`)                |
| The booking grid took up to a second to finish appearing                                                                           | Under half a second                                                                            |

Tests this pass (local Postgres 18, real API, Chromium): typecheck 0 errors, lint
clean, **101 / 101** API tests, **11 / 11** database blocks, **145 / 145** browser
steps, production build OK,
`pnpm audit --prod` clean.

Decided by the owner the same day, done and verified:

- **Sign-up asks for phone and gender** (branch `claude/ecstatic-noether-lm132w`)
  is merged: migration `20261004000000_user_gender`, required phone, gender at
  sign-up and in the profile, and the admin gate now says "couldn't check your
  access" with a retry when the API is unreachable instead of redirecting.
- **Legacy `clubs`, `staff_roles` and `terrains.capacity` are dropped** by the
  guarded migration `20261006000000` (rollback in `supabase/rollbacks`), applied to
  the hosted project. Repository and hosted database now hold the same 9 migrations.

Also closed the same day:

- The admin activity feed reads in the admin's language (the API still files its
  entries in English; bookings carry a numeric date).
- Cancelling a recurring booking tells each member concerned once, with the number
  of sessions cancelled, and is recorded in the activity feed.
- "Minimum players" is shown to players on a match still below it ("1 more to
  play"). It never blocks a booking.

Still open: e-mail confirmation, SMTP, Google sign-in and the domain need the
club's accounts.

## Pass 4 (2026-10-02): code review and refactor

No database change, no new feature. Where each responsibility lives is now written
down in `docs/ARCHITECTURE.md`.

Behaviour that changed, all covered by tests:

| Found                                                                                                                          | Now                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| The desk removing a player left that player's rental gear reserved, and a member's match with nobody in it stayed on the grid  | One rule for "a player leaves" and "the desk removes a player": refund, gear released, organiser handed over, empty match cancelled |
| A member leaving a desk booking made for a guest cancelled the guest's booking                                                 | Guest bookings stay                                                                                                                 |
| Editing a booking without sending `notes` erased the notes                                                                     | Only what the request carries is changed                                                                                            |
| Several refusals had no machine code (401 / 403 of the sign-in checks, notifications, recurring bookings, the cron endpoint)   | Every refusal is `{ error, code }`                                                                                                  |
| An archived or inactive court was readable by anyone through `GET /terrains/:id`                                               | Admins only, like the list                                                                                                          |
| "1 token" was written in five screens and one toast, whatever the club's token cost                                            | The club's configured cost, or what the API actually charged                                                                        |
| A late cancellation under "no refund" still said "your tokens were refunded"                                                   | The real outcome                                                                                                                    |
| Dates were formatted in the visitor's own timezone on most screens; admin date-time fields were read in the browser's timezone | Club time everywhere, through one module                                                                                            |
| The admin timeline was drawn from 07:00 to 24:00 whatever the opening hours                                                    | The club's opening hours                                                                                                            |

Structure:

- API: route files no longer import each other; booking rules are in
  `lib/bookings.ts`, member names in `lib/members.ts`, the signed-in member is read
  with `currentUser(req)`. No `any` left in the API source; request bodies are
  unknown until validated.
- Website: the 1,500-line calendar is four files in `components/calendar/`; one API
  access path (the typed client); the client's types match what the API accepts and
  returns, which removed about 45 casts.
- Removed: the generated `lib/api-zod` package (63 files, used for one health
  check), the unused `drizzle-zod` schemas, about 60 template entries in the API
  build script, unused helpers and types.

Tests this pass (local Postgres 18, real API, Chromium): typecheck 0 errors (the API
tests are now type-checked too), lint clean, **82 / 82** API tests (75 + 7 new),
**11 / 11** database blocks, **26 / 26** browser steps, production build OK.

Open, for the owner:

- ~~Token expiry is half-built~~: removed in pass 5 (tokens never expire).
- **Tournament unregistration**, **adding equipment to an existing booking** and
  **marking one notification read** exist in the API but have no button.
- The legacy tables `clubs`, `staff_roles` and the column `terrains.capacity` are
  still there, unused.

## 0. Pass 3 (2026-10-02): re-audit against the live project

Verified on the hosted project this session: 23 tables, RLS on all, no policy, no
table / view / function / sequence reachable by `anon` or `authenticated` (catalog
check **and** real REST, RPC, GraphQL and Storage calls with the public key: all
refused); ledger reconciled; no orphan rows; migration history equal to the
repository plus one version from an unmerged branch (below).

| Found                                                                                                                                                      | Status                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A member of a match received the full database row of the other players (e-mail, phone, token balance, auth id)                                            | Fixed: names only ("First L."), tested                                     |
| `pnpm run lint` failed (529 errors): ESLint walked into a local tooling copy of the repository                                                             | Fixed: tooling folders ignored by ESLint and git                           |
| The API tests could not start on Windows (`TZ=… node`); the SQL tests needed `psql`                                                                        | Fixed: both run on every OS                                                |
| `created_at` and every SQL `now()` depended on the database server's time zone (correct on Supabase, wrong elsewhere)                                      | Fixed: API sessions pinned to UTC, tested                                  |
| Equipment availability assumed 90-minute matches; the desk's rental list used the server's day, not the club's                                             | Fixed: club match length and club day, tested                              |
| News, equipment, pricing rules, recurring bookings, push: inputs not validated (crashes answered as 500, any image URL accepted, `24:30` accepted)         | Fixed: validated, clean 4xx, tested                                        |
| A member could remove another member's push subscription by knowing its endpoint                                                                           | Fixed, tested                                                              |
| Recurring bookings computed weekly dates in the server's time zone                                                                                         | Fixed: club time, tested                                                   |
| Cash payments marked at the desk, court changes and pricing-rule changes left no trace; role changes were filed as "user registered"                       | Fixed: audit-trail types (migration `20261005000000`), tested              |
| Two simultaneous token operations of one member (two joins, a booking and a join) deadlocked in Postgres: one answered 500 after a second (no tokens lost) | Fixed: wallet lock no longer conflicts with the booking's own rows, tested |
| Production API started with CORS open to every website when `CORS_ORIGIN` was missing (a warning only)                                                     | Fixed: refuses to start                                                    |
| "Tokens in circulation" was summed in the browser over the first 200 members                                                                               | Fixed: computed by the API                                                 |
| The whole data cache was dropped each time the tab regained focus and every hour; `/users/sync` re-posted each time                                        | Fixed: only when the signed-in member changes                              |
| Member search could be scripted to walk the member list                                                                                                    | Fixed: per-member limit                                                    |
| Demo build scripts did not run on Windows                                                                                                                  | Fixed at the time; demo mode has since been removed                        |
| No security headers for the static site                                                                                                                    | `_headers` file shipped; CSP template in the deployment guide              |

Open, not code:

- **E-mail confirmation is off on the hosted project** (accounts are created without
  proving the address) and leaked-password protection is off. Turn both on once SMTP works.
- **Google sign-in is not enabled** on the hosted project (only e-mail).
- **The hosted database is one migration ahead of `main`**: `20261004000000_user_gender`
  (a `users.gender` column) comes from the unmerged branch
  `claude/ecstatic-noether-lm132w` ("Sign-up asks for phone and gender"). `main` works
  with it (nullable, unused). Merge that branch or drop the column: owner's decision.
- **"Minimum players"** is stored and validated but no booking rule uses it.
- **No in-app account deletion**; the member lists of two admin dropdowns stop at 200.
- Ledger descriptions are stored in English and shown as such in the French UI.

Tests this pass (local Postgres 18, real API, Chromium): typecheck 0 errors, lint
clean, **75 / 75** API tests (61 existing + 14 new), **11 / 11** database blocks plus
one new, **26 / 26** browser steps, production build OK. See `docs/TESTING.md`.

## 1. Executive summary

- **Product model**: one codebase, one Supabase project and one deployment per
  club. No multi-tenancy, no `tenant_id` / `club_id`, no shared customer data.
  Branding is design-time (`VITE_CLUB_*` + image files). Operational rules are
  edited by the club in **Admin → Réglages** and **Admin → Terrains**.
- **Nothing operational is hard-coded any more**: match duration, players per
  match, booking window, cancellation policy, prices, currency, token costs and
  packs, opening hours, holidays/exceptions, court list and overrides, feature
  switches and notification switches all come from the database, validated in
  the form, the API and by database constraints.
- **Security**: browsers reach Supabase for auth only; every table is behind the
  API, which never trusts user ids, roles, balances or prices from the client.
  No project ref, URL or key in the source.
- **Verified locally**: typecheck 0 errors, lint clean, 61/61 API tests, 11/11
  database invariant blocks, 26/26 browser E2E steps (including the admin
  switching to 60-minute matches at new prices and players following), build OK,
  `pnpm audit --prod` clean.
- **Not done**: real e-mail (SMTP), Google sign-in and the production domain still
  need the club's accounts (§12).

## 2. Fixed

Pass 2 (this release):

| Area               | Fix                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard-coded rules   | 90 min, 4 spots, 25 TND, 1/4 tokens, 08:00–23:00, "TND" removed from API, e-mails and UI; read from settings                                                                                                                    |
| Calendar           | Grid built from the club's duration and the day's hours (weekly, court override, exceptions); bookings mapped by overlap, so a duration change never hides or double-sells an existing match; closed days and maintenance shown |
| Admin booking form | Time chips came from a local 90-minute grid in the **browser's** time zone; now the API's free slots (club time, real availability)                                                                                             |
| Settings cache     | `GET /settings` was cacheable 30 s by the browser: players saw old prices after a change. Now `no-cache` (found by E2E)                                                                                                         |
| Réglages form      | Saving one section wiped unsaved edits in the others (found by E2E); sections now keep pending edits                                                                                                                            |
| Cancellation       | Notice hours were an env variable; now a setting with "forbid" or "no refund" after the deadline (other players always refunded)                                                                                                |
| Branding           | "Smash Padel", address and Tunis defaults removed from code, HTML and manifest; generated from `VITE_CLUB_*`                                                                                                                    |
| Project ref        | Removed from `.env.example`, `supabase/config.toml` and docs                                                                                                                                                                    |

Pass 1 (still in place): legacy insecure prototype schema handled by a guarded
migration; RLS lockdown; overlap exclusion constraint; capacity trigger;
append-only ledger with a balance/ledger check; idempotent admin credits;
payment states `token` / `cash_club` / `invited_free`; full-court invites free;
admin cash marking; last-admin protection; Google OAuth wiring; password reset;
club-time display; Replit leftovers removed.

## 3. Database

New migration `20261003000000_club_settings.sql` (additive; the only data change
turns court prices/hours equal to the old defaults into "use club setting",
which behaves identically):

- `club_settings` (single row, CHECK ranges), `opening_hours` (7 days),
  `schedule_exceptions` (holidays, special hours, per court or club),
  `token_packages` (10/250, 20/480, 50/1150)
- `terrains`: number, order, maintenance + note, archived; price and hours become
  optional overrides
- `token_transactions`: `cash_amount`, `package_id`
- `player_invites`: `invited_user_id`, `responded_at`, status `declined`,
  one pending personal invite per member and match
- activity type `settings_updated`; same RLS lockdown on the new tables

Docs: `docs/DATABASE.md`, `docs/DATABASE_DIAGRAM.md`. Legacy unused tables kept
(private, empty): `clubs`, `staff_roles`; column `terrains.capacity`.

## 4. Supabase

- Live project checked this session (read-only): reachable; still the 5 prototype
  migrations of 2026-06-29; every prototype table **empty**; **0 auth users**.
  The repository migrations are **not applied** there yet (§13).
- `supabase/config.toml` is now a neutral local-stack config; each club's
  project is linked by ref at deploy time.
- New guide per club: `docs/SUPABASE_NEW_CUSTOMER.md`.

## 5. Authentication

- E-mail/password with confirmation and reset (`/reset-password`); Google OAuth
  behind `VITE_AUTH_GOOGLE_ENABLED`; **Apple prepared** behind
  `VITE_AUTH_APPLE_ENABLED` (off; needs an Apple Developer account).
- Profiles are created by a trigger on `auth.users`; the API reads the role from
  `public.users`, never from the token.
- Guides: `docs/GOOGLE_AUTH_CONFIGURATION.md` (Apple included),
  `docs/EMAIL_CONFIGURATION.md`.

## 6. Reservations

- Bookable = active, not archived, not in maintenance, open that day, on the
  duration grid, ends by closing, and (players) within min notice / max days.
- End time = start + the duration at booking time; spots = max players at
  booking time. Existing bookings are never changed by a settings change.
- Full court: booker pays the full-court cost, friends join free via link, QR or
  **personal invitation** (accept/decline, notification, dashboard card).
- Own spot: others join with a token or pay at the club (if enabled).
- Open matches, invitations and pay-at-the-club can each be switched off
  (hidden in the UI and refused by the API).
- Cancellation within the deadline refunds everyone; after it, "forbid" or
  "no refund" for the canceller's own tokens. Admins can always cancel and refund.
- Recurring series check every session against hours, holidays and maintenance.

## 7. Token system

- Costs per spot / per full court from Réglages, overridable by peak/off-peak rules.
- Desk sales: a **pack** (tokens + price from `token_packages`) or a number of
  tokens with the **cash received**; minimum purchase applies to sales, not to
  gifts or corrections. Every move is in the append-only ledger with the admin.
- Token expiry: **not implemented** (tokens never expire); documented.

## 8. UX/UI

- **Admin → Réglages**: sections Terrains, Réservations, Tarifs, Tokens,
  Horaires (+ exceptions), Fonctionnalités, Notifications; French labels with
  explanations and examples, inline validation, confirmation when bookings exist,
  save toast, **Valeurs par défaut** per section, last-change date.
- **Admin → Terrains**: number, photo, maintenance note, price/hours override,
  reorder, archive/restore, archived list.
- Players: prices, durations and token costs everywhere come from the club's
  settings; invitations card on the dashboard; "Occupé" for matches spanning
  grid rows; closed-day message with the reason.

## 9. Architecture

- API: `lib/settings.ts` (cached settings, 10 s TTL + invalidation),
  `lib/slots.ts` (schedule engine), `lib/pricing.ts` (rule > court > settings),
  `routes/settings.ts` (zod-validated, strict). All club data goes through Express.
- Client: typed hooks in `lib/api-client-react/src/extras.ts`; `useClubRules()`
  for every screen.
- Configuration layers: `docs/CONFIGURATION.md`.

## 10. Security

See `docs/SECURITY.md`. Highlights: browser roles revoked on all tables
(including the new ones), settings admin-only and strict (no injected fields),
member search returns public names only with escaped wildcards, features off are
refused server-side, secrets only in host environments, one set of secrets per club.

## 11. Test results (this session, local)

| Suite                                               | Result                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                                | 0 errors                                                                                                                                                                                                                                                            |
| `pnpm run lint`                                     | clean                                                                                                                                                                                                                                                               |
| API integration (real Postgres 16 + all migrations) | **61 / 61** (38 existing + 23 new: settings API & validation, 60-min scenario, max players, booking window, weekly hours, holidays and special hours, courts, cancellation policies, feature switches, personal invitations, packs and cash, notification switches) |
| Database invariants                                 | **11 / 11** blocks (new: single settings row, ranges, hours, unique exceptions, court inheritance)                                                                                                                                                                  |
| Browser E2E (Chromium)                              | **26 / 26**, run three times on fresh databases; ledger reconciled                                                                                                                                                                                                  |
| `pnpm run build`                                    | OK; branding injected into HTML and manifest                                                                                                                                                                                                                        |
| `pnpm audit --prod`                                 | no known vulnerabilities                                                                                                                                                                                                                                            |

Not testable here: real e-mails, Google/Apple sign-in, the API against the live
project (network policy blocks `*.supabase.co`).

## 12. Manual configuration still required

| What                                 | Where                                 | Guide                                   |
| ------------------------------------ | ------------------------------------- | --------------------------------------- |
| Apply migrations to the live project | SQL Editor (paste `db:bundle` output) | `docs/PRODUCTION_DEPLOYMENT.md` §1      |
| Domain, DNS, HTTPS                   | registrar / host                      | `docs/DOMAIN_SETUP.md`                  |
| Auth URLs, SMTP, templates           | Supabase dashboard                    | `docs/EMAIL_CONFIGURATION.md`           |
| Google client (and Apple later)      | Google Cloud + Supabase               | `docs/GOOGLE_AUTH_CONFIGURATION.md`     |
| Secrets and branding variables       | hosts' environment                    | `.env.example`, `docs/CONFIGURATION.md` |
| Club images (logo, icons, photos)    | `artifacts/padel-club/public/`        | `docs/CONFIGURATION.md` §2              |
| First admin, courts, Réglages        | SQL editor, then the app              | `docs/NEW_CUSTOMER_SETUP.md` phase 6    |
| CAPTCHA (recommended)                | Supabase Attack Protection + site key | `docs/SECURITY.md`                      |

## 13. New customer process

`docs/NEW_CUSTOMER_SETUP.md`, in 7 phases: collect → accounts → configuration →
database & auth → deploy → club setup with the owner → acceptance & handover,
plus how to roll a release out to every club.

## Production checklist

- [x] Production build succeeds
- [x] No TypeScript errors, no ESLint errors
- [x] No hard-coded operational rule (duration, spots, prices, tokens, hours, courts)
- [x] No project ref / Supabase URL / key in the source
- [x] Settings validated in UI, API and database; reset to defaults works
- [x] Admin change of duration and price applies to the next booking (E2E)
- [x] No double booking (overlap constraint, 10-way race, duration change)
- [x] Token accounting reconciles (API tests + E2E)
- [x] Access model: browsers have no table access (local copy with the exact migrations)
- [x] Migrations applied on the live project (2026-10-01, SQL editor; 6 versions in history)
- [x] Access model verified **on the live project** (RLS on 23/23 tables, 0 policies, 0 tables reachable by anon/authenticated, realtime empty, no storage policies, no security-definer function executable by anon; advisors: only the intended "RLS enabled, no policy" notices)
- [ ] Authentication end to end with real e-mails (needs SMTP)
- [ ] Google login tested (needs the club's Google client)
- [ ] Production domain configured
- [ ] First admin created
