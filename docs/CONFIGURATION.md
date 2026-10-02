# Configuration: what goes where

Each club is a separate installation. A value lives in exactly one of three places:

| Layer                    | Who sets it        | When                    | Where                                                  |
| ------------------------ | ------------------ | ----------------------- | ------------------------------------------------------ |
| **1. Infrastructure**    | Developer (Amivio) | at installation         | `.env` / host environment (secrets never in git)       |
| **2. Branding**          | Developer (Amivio) | at build time           | `VITE_CLUB_*` in `.env` + image files in `public/`     |
| **3. Operational rules** | Club admin         | any time, in production | the app: **Admin → Réglages** and **Admin → Terrains** |

Nothing operational is hard-coded: prices, durations, players, token costs, hours,
courts and feature switches are read from the database on every request. The
Supabase project, domain and keys are only in the environment.

---

## 1. Infrastructure (`.env`, never committed)

See `.env.example` for the full list with comments. Summary:

| Variable                                              | Where          | Notes                                            |
| ----------------------------------------------------- | -------------- | ------------------------------------------------ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`         | website build  | public by design                                 |
| `VITE_SITE_URL`, `VITE_API_URL`                       | website build  | public                                           |
| `VITE_AUTH_GOOGLE_ENABLED`, `VITE_AUTH_APPLE_ENABLED` | website build  | show a provider only once it's configured        |
| `DATABASE_URL`                                        | API            | **secret** (database password)                   |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`           | API            | service role key is **secret**                   |
| `SUPABASE_JWT_SECRET`                                 | API (optional) | **secret**; local token verification             |
| `CORS_ORIGIN`, `FRONTEND_URL`, `TRUST_PROXY`          | API            |                                                  |
| `TZ`, `CLUB_TIMEZONE`, `VITE_CLUB_TIMEZONE`           | API + website  | the club's time zone (IANA, e.g. `Africa/Tunis`) |
| `CLUB_NAME`, `CLUB_ADDRESS`                           | API            | used in e-mails and push                         |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`      | API            | API key is **secret**                            |
| `VAPID_*`                                             | API            | private key is **secret**; one key pair per club |
| `JOBS_ENABLED`, `CRON_SECRET`                         | API            | cron secret is **secret**                        |
| `RATE_LIMIT_WRITES_PER_MINUTE`                        | API            |                                                  |

The time zone is an installation setting (not in Réglages) because changing it
would shift every existing booking.

## 2. Branding (design-time, per customer)

Set by the developer for each club; not editable by the admin (by design).

| What                                        | How                                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club name, short name, tagline, description | `VITE_CLUB_NAME`, `VITE_CLUB_SHORT_NAME`, `VITE_CLUB_TAGLINE`, `VITE_CLUB_DESCRIPTION` → page titles, `index.html`, PWA manifest, footer, install banner, calendar files                                                                                  |
| Theme colour (browser bar, splash)          | `VITE_CLUB_THEME_COLOR`                                                                                                                                                                                                                                   |
| Address, map, contact, social               | `VITE_CLUB_ADDRESS`, `_POSTAL`, `_CITY`, `_COUNTRY`, `_MAPS_QUERY`, `_PHONE`, `_WHATSAPP`, `_EMAIL`, `_INSTAGRAM`, `_FACEBOOK` (empty = hidden)                                                                                                           |
| Logo and favicon                            | `artifacts/padel-club/public/logo.svg`, `favicon.svg`, `src/components/smash/brand.tsx` (logo mark)                                                                                                                                                       |
| App icons                                   | `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`                                                                                                                                                                    |
| Photos                                      | `public/hero-court.webp`, `terrain-indoor.webp`, `terrain-outdoor.webp`, the four photos of the home page courts section `club-main`, `club-detail`, `club-indoor`, `club-outdoor` (each as `-960`, `-1920` and a 4K `.webp`), `opengraph.jpg` (1200×630) |
| Colours and fonts                           | design tokens in `src/index.css` (`--color-*`), fonts in `index.html` (`docs/DESIGN_SYSTEM.md`)                                                                                                                                                           |
| Homepage texts                              | `src/pages/home.tsx`                                                                                                                                                                                                                                      |

Keep one branch or one folder of assets per customer outside this repo (e.g. a
private `clubs/<club>/` with `.env` and the image files) and copy them in before
building. Never commit a customer's `.env`.

## 3. Operational rules (Admin → Réglages)

Edited by the club's admins in the app. Saved in `club_settings`,
`opening_hours`, `schedule_exceptions`, `token_packages` and `terrains`. Validated
in the form, in the API and by database constraints. Every change is logged in
the activity feed with the admin and the old → new values. Each section has
**Valeurs par défaut** to restore the installation defaults.

| Section             | Settings (default)                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Terrains**        | Courts: name, number, description, indoor/outdoor, photo, order, bookable, maintenance + note, archive/restore, optional price and hours override (Admin → Terrains)                                                                                                                                |
| **Réservations**    | Match duration (90 min; 60/90/120 or 30–240 by 5), min players (1; shown to players on a match below it), max players = spots per match (4), book at the latest (30 min before), at the earliest (14 days ahead), cancellation deadline (0 h = until start), after the deadline: forbid / no refund |
| **Tarifs**          | Currency (TND), price per player (25), full court price (100). Peak / off-peak / weekend / holiday prices: pricing rules in Admin → Tarifs                                                                                                                                                          |
| **Tokens**          | Tokens per spot (1), per full court (4), price of one token (25), minimum purchase (1), packs (10 = 250, 20 = 480, 50 = 1150)                                                                                                                                                                       |
| **Horaires**        | Weekly hours per day (08:00–23:00 every day), exceptions: holiday / closure / special hours, whole club or one court                                                                                                                                                                                |
| **Fonctionnalités** | Open matches (on), invitations: link, QR, member invitation (on), pay at the club (on)                                                                                                                                                                                                              |
| **Notifications**   | Confirmations, cancellations, invitations, tokens credited, after the match, reminder (on, 120 min before)                                                                                                                                                                                          |

### How a change applies

- **New bookings** follow the new rules immediately (the saving API instance
  clears its cache; other instances within 10 s; players' screens within 30 s or
  on reload).
- **Existing bookings keep** their start, end, spots and the tokens they were
  charged. When the duration changes, the planning builds the new grid around
  them (a free slot that would overlap an existing match is not offered), and the
  database refuses any overlap anyway.
- Lowering max players doesn't remove anyone from existing matches.
- A court in maintenance or archived accepts no new booking; its existing
  bookings stay (the admin is told how many and decides whether to cancel them).
  A court with upcoming bookings can't be archived.
- Turning a feature off hides it in the app **and** the API refuses it
  (`FEATURE_DISABLED`), so old links stop working too.

### Price resolution (per slot)

1. A matching **pricing rule** (day + time range, court or club-wide, highest
   priority) sets tokens per spot and optionally the cash price per person; the
   full court then costs tokens per spot × max players.
2. Otherwise the **court override** price (if set).
3. Otherwise **Réglages**: tokens per spot / per full court, player / full court price.

### Not implemented (documented on purpose)

- **Token expiry**: tokens never expire. The API refuses a credit that carries an
  expiry date, and no screen announces one (the `expires_at` column is unused).
- **Online payment in the boutique**: an order is never paid on the site. The club
  calls the member to confirm it and is paid in cash on delivery or at the desk.
- **Minimum players** never blocks a booking: a player can always book only their
  spot. A match below the minimum shows "1 more to play" to its players.
- **Automatic refund of cash already paid** for a cancelled match: staff handle it
  at the desk (token payments are refunded automatically).

## Adding a new setting (developer)

1. Migration: add the column to `club_settings` with a default and a CHECK.
2. Drizzle: `lib/db/src/schema/settings.ts`.
3. API: add it to the zod schema and a section in `routes/settings.ts`; expose it
   in `publicSettings()` if players need it; read it with `getSettings()`.
4. Client: `ClubRules` / `AdminSettings` types in `lib/api-client-react/src/extras.ts`.
5. UI: a field in `src/pages/admin-settings.tsx`; read it with `useClubRules()`.
6. Tests: `artifacts/api-server/test/settings.test.ts`.
