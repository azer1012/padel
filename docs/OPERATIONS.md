# Operations: pricing, equipment, recurring bookings, notifications, app install

## Before deploying

1. **Apply every migration** in `supabase/migrations/` (see `docs/PRODUCTION_SETUP.md`).
2. **Set `TZ=Africa/Tunis`** on the API server (it also defaults to `CLUB_TIMEZONE`).
   The booking grid is built in club time.
3. Fill the server variables in `.env.example` (e-mail, push, jobs).

## Payments per player

Each player in a match has an independent payment:

| Type           | Meaning                                                  | Status                                                      |
| -------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| `token`        | paid with their own token(s) when joining                | `paid` → `refunded` if they leave or the match is cancelled |
| `cash_club`    | holds the spot, pays at the front desk                   | `pending` → `paid` (staff tick it in the match dialog)      |
| `invited_free` | invited by a full-court booker, who already paid 4 spots | `paid`                                                      |

Tokens are bought with cash at the desk: **Admin → Membres → Tokens → Créditer**.

## Peak / off-peak pricing (Admin → Tarifs)

- 1 token = 1 player spot. With no rule, every slot costs 1 token per spot (full court = 4).
- A rule sets **tokens per spot** for chosen days and a time range, for all courts or one court.
  Example: weekdays 17:00–24:00 → 2 tokens/spot (full court = 8).
- Overlapping rules: highest priority wins, then court-specific beats club-wide.
- Rules are evaluated in club time (`CLUB_TIMEZONE`), and apply to **new** bookings only.
- "Prix affiché" (TND) is shown to walk-ins; token prices are what players pay in the app.

## Equipment rental (Admin → Matériel)

- Catalogue: name, price (TND, paid at the front desk), stock **per 90-minute slot**.
- Players add rackets/balls when booking (or later from their booking). Stock is checked under a
  database lock, so the last racket can't be rented twice.
- **Prep list**: everything to hand out today/tomorrow, grouped by match, with "Remis" / "Rendu".
- Cancelling a booking or leaving a match releases the equipment automatically.

## Recurring bookings (Admin → Réservations → Récurrente)

- Same court and time every 1 or 2 weeks, 2–52 sessions, for a member or a named group.
- **Preview first**: dates already taken are flagged and skipped (never overwritten).
- No tokens are charged: each session gets a pending cash payment to tick off at the desk.
- "Annuler la série" cancels only future sessions; past ones stay in history.

## Notifications

| Event                                                      | In-app | Email | Push |
| ---------------------------------------------------------- | ------ | ----- | ---- |
| Welcome (first sign-in)                                    | ✓      | ✓     |      |
| Booking / join confirmed (with peak price + equipment)     | ✓      | ✓     | ✓    |
| Booking cancelled / left (with refund)                     | ✓      | ✓     | ✓    |
| Reminder ~2 h before the match (with equipment to pick up) | ✓      | ✓     | ✓    |
| Match finished: thanks + "book the next one"               | ✓      | ✓     | ✓    |
| Tokens added by the club                                   | ✓      | ✓     | ✓    |

- Written in the player's language (FR / EN / AR, RTL for Arabic).
- Players control email and push in **Profil → Notifications**.
- Every send is recorded in `notification_log` (unique per user + event + match), so retries,
  restarts or several API instances never send duplicates.
- **Email setup (Resend)**: create an account, verify your domain (DNS records), put the API key in
  `RESEND_API_KEY` and a sender on that domain in `EMAIL_FROM`.
- **Push setup**: run `npx web-push generate-vapid-keys` once, set `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY`. On iPhone, push works only after the app is added to the home screen (iOS 16.4+).

### Scheduler

- `JOBS_ENABLED=true` (default): the API runs reminders and "match finished" every 5 minutes.
- Serverless or sleeping hosts: set `JOBS_ENABLED=false`, set `CRON_SECRET`, and call every 5 minutes:
  `curl -X POST https://api.example.tn/api/internal/jobs/run -H "x-cron-secret: $CRON_SECRET"`

## Installable app (PWA)

- `public/manifest.webmanifest`, `public/sw.js`, icons in `public/`.
- Android/Chrome/Edge: players see an "Installer" card on their dashboard. iPhone: the card explains
  Share → "Sur l'écran d'accueil". Dismissing hides it for 3 weeks.
- The service worker caches the app shell for offline start but **never caches `/api/` responses**,
  so availability is always live. It is disabled in demo mode and inside iframes.
- Home-screen shortcuts: Réserver, Open matches, Mes réservations.

## Privacy

- Anonymous visitors and other players see names as "Yasmine B." (never an email) in the calendar,
  open matches and invite links. Admins see full names.
