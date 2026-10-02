# Architecture

One answer to "where is…?" for each responsibility. Read `docs/DATABASE.md` for the
tables and `docs/SECURITY.md` for the access model.

## The shape

```
Browser ──► Supabase Auth          sign-up, sign-in, password reset (nothing else)
Browser ──► Express API ──► Postgres (the club's Supabase project)
```

- The browser never reads or writes a table: every table is closed to the `anon`
  and `authenticated` roles. The API connects with the database URL and is the only
  writer.
- The API holds every business rule. The website displays what the API returns
  (prices, free slots, what a viewer may do) and never decides on its own.
- The database independently guarantees what must never break, even if the API had
  a bug: no overlapping bookings, match capacity, the token ledger.

| Package                | Role                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `artifacts/api-server` | Express API: routes, business rules, notifications, jobs     |
| `artifacts/padel-club` | React website: public site, player app, admin                |
| `lib/db`               | Drizzle schema and the database connection (API only)        |
| `lib/api-client-react` | Typed React Query client (website only)                      |
| `lib/api-spec`         | OpenAPI description of the API (documentation)               |
| `supabase/migrations`  | The database: schema, constraints, triggers, access lockdown |
| `scripts`              | Dev runner, migrations, database tests, browser E2E          |

## API (`artifacts/api-server/src`)

A request goes `app.ts` (headers, CORS, JSON, write rate limit) → `routes/*` →
`lib/*` → `@workspace/db`. Routes read the request, check who is asking, call the
rules in `lib/` and shape the answer. Rules shared by several routes live in `lib/`;
a route file never imports another route file.

| Looking for                                | It is in                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration (environment)                | `config/env.ts` (validated at start; operational rules are not env)                                                                         |
| Authentication, roles                      | `lib/auth.ts`: `requireAuth` / `requireUser` / `requireAdmin` / `loadUser`, and `currentUser(req)` / `optionalUser(req)` to read the member |
| Errors and input helpers                   | `lib/http.ts` (`HttpError`, `Body`, `requireId`, `cleanText`, `toMoney`, `cleanImageUrl`, `paging`) and `middleware/error-handler.ts`       |
| Club settings (duration, prices, features) | `lib/settings.ts` (cached read) · edited through `routes/settings.ts`                                                                       |
| Opening hours, bookable slots              | `lib/slots.ts` (`dayHours`, `gridStarts`, `assertBookable`)                                                                                 |
| Club time (timezone)                       | `lib/club-time.ts`                                                                                                                          |
| Pricing                                    | `lib/pricing.ts` (`priceFor`: pricing rule > court override > settings)                                                                     |
| Booking rules                              | `lib/bookings.ts`: cancellation deadline, refunds, taking a player out of a match, blocked slots, booking conflicts                         |
| Token wallet                               | `lib/ledger.ts` (`moveTokens`: the only way a balance changes)                                                                              |
| Rental equipment                           | `lib/equipment.ts`                                                                                                                          |
| Member names (full / public)               | `lib/members.ts`                                                                                                                            |
| Audit trail of staff actions               | `lib/activity.ts` (`logActivity`)                                                                                                           |
| Notifications                              | `lib/notify/`: `index.ts` (who gets what, once), `templates.ts` (copy, 3 languages), `mailer.ts`, `push.ts`                                 |
| Scheduled jobs (reminders)                 | `jobs/index.ts`, triggered in-process or by `routes/jobs.ts`                                                                                |

Routes by area: `reservations.ts` (book, list, cancel), `player-sessions.ts` (join,
leave, invitations, open matches, desk actions on a match), `series.ts` (recurring
bookings), `calendar.ts` (the planning grid), `tokens.ts`, `settings.ts`,
`terrains.ts`, `pricing.ts`, `equipment.ts`, `users.ts`, `tournaments.ts`,
`news.ts`, `notifications.ts`, `push.ts`, `dashboard.ts`.

Conventions:

- Refuse by throwing `HttpError(status, message, CODE)`. Every error leaves as
  `{ error, code }`; clients branch on `code`.
- Request bodies are `Body` (unknown fields) until a parser has validated them.
- Whatever must change together runs in one `db.transaction`; token movements only
  through `moveTokens(tx, …)`.
- Money, durations, capacities and feature switches come from `getSettings()`,
  never from a constant.

## Website (`artifacts/padel-club/src`)

| Looking for                     | It is in                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Routes and route guards         | `App.tsx` (`ProtectedRoute`, `AdminRoute`)                                                                           |
| Session (Supabase Auth)         | `lib/auth.tsx`, `lib/supabase.ts`, pages `auth.tsx`, `reset-password.tsx`                                            |
| API calls                       | `@workspace/api-client-react` only (hooks + `customFetch`); the token is attached in `App.tsx` via `services/api.ts` |
| Club rules on screen            | `hooks/use-club-rules.ts` (`useClubRules()`)                                                                         |
| Branding of the installation    | `config/club.ts` (from `VITE_CLUB_*`)                                                                                |
| Dates and times                 | `lib/club-time.ts` (always club time; date-fns only for "in 2 hours")                                                |
| Translations                    | `lib/i18n.tsx` (`useTx` for inline copy)                                                                             |
| Shared wording helpers          | `lib/labels.ts`                                                                                                      |
| The planning (booking calendar) | `components/calendar/`: `court-calendar.tsx` (grid), `book-dialog.tsx`, `match-dialog.tsx`, `shared.tsx`             |
| Building blocks                 | `components/ui/` (primitives), `components/smash/` (product components)                                              |
| Pages                           | `pages/` (one file per screen; `admin-*.tsx` are staff screens)                                                      |

Conventions:

- Server state is React Query; query keys come from the client (`get…QueryKey()`,
  `extrasKeys`, `settingsKeys`). After a mutation, invalidate the affected keys.
- Show API errors with `apiErrorMessage(e, fallback)`; branch on `apiErrorCode(e)`.
- Prices, token costs and durations on screen come from the API (calendar slot,
  quote) or `useClubRules()`.

## Database

`supabase/migrations/*.sql` is the source of truth; `lib/db/src/schema` mirrors it for
Drizzle. A schema change is a new migration plus the matching schema edit. Tests:
`supabase/tests/db-invariants.sql`.

## Tests

`docs/TESTING.md`. API integration tests are in `artifacts/api-server/test`, the
browser journey in `scripts/e2e`.
