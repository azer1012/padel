# Audit and hardening report — reusable padel club product

Two passes on `main`: (1) production audit and hardening of the platform,
(2) turning it into a reusable product sold one club at a time, with every
operational rule configurable by the club. This report covers the current state.

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
- **Not done**: the hosted project still holds the old empty prototype schema;
  applying the migrations is one paste in the SQL editor (§13). Real e-mail,
  Google sign-in and the live API can't be tested from this environment.

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
  for every screen. Demo mode mocks the new endpoints.
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
