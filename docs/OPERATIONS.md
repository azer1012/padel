# Operations: pricing, equipment, recurring bookings, notifications, app install

## Before deploying

1. **Apply every migration** in `supabase/migrations/` (see `docs/PRODUCTION_DEPLOYMENT.md`).
2. **Set `TZ` and `CLUB_TIMEZONE`** to the club's time zone on the API server.
   The booking grid is built in club time.
3. Fill the server variables in `.env.example` (e-mail, push, jobs).
4. Set the club's rules in **Admin → Réglages** (see `docs/CONFIGURATION.md`).

## Payments per player

Each player in a match has an independent payment:

| Type           | Meaning                                                     | Status                                                      |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `token`        | paid with their own token(s) when joining                   | `paid` → `refunded` if they leave or the match is cancelled |
| `cash_club`    | holds the spot, pays at the front desk                      | `pending` → `paid` (staff tick it in the match dialog)      |
| `invited_free` | invited by a full-court booker, who already paid every spot | `paid`                                                      |

Tokens are bought with cash at the desk: **Admin → Membres → Tokens → Créditer**,
either a pack (Réglages → Tokens → packs) or a number of tokens with the cash
received. Every credit stores who did it, the pack and the cash amount.
"Pay at the club" can be switched off in Réglages → Fonctionnalités.

## Photos (courts, news, tournaments, boutique)

- In each form, **Choisir une photo** opens the computer's files, or the gallery and
  the camera on a phone. The photo is made lighter in the browser (1600 px on its long
  side, WebP) before it is sent: a 6 MB phone photo becomes a few hundred kB, and what
  the camera wrote into the file (place, device) is left behind.
- Accepted: JPEG, PNG, WebP, 5 MB at most once lightened. Anything else is refused.
- A court, an article of the news and a tournament have **one photo**: picking another
  replaces it, the cross removes it. A tournament without a photo keeps the club's
  drawn cover.
- A boutique article has **up to 6 photos**. The first one is on the article's card;
  the star puts another one first. Members swipe through them (arrows on a computer).
- **Ou coller le lien d'une photo** still takes an `https://` link or a file of the
  site (`/club-detail-960.webp`).
- A photo is kept in the club's own storage (`docs/SUPABASE_NEW_CUSTOMER.md` §5). One
  that no page shows any more (replaced, removed, or picked in a form never saved) is
  deleted by the scheduled jobs a day later.
- In the public demo, files cannot be sent: only links.

## Closing the day's cash (Admin → Caisse)

- Everything the desk took in cash over a period (today by default): tokens sold with
  a cash amount, spots paid at the club, boutique orders handed over. One line per
  payment with the member and the admin who took it, and the totals.
- A cash spot enters the report the moment the desk marks it paid, for the slot's desk
  price (the whole court when the booker pays it all). Un-marking it takes it out.
- **Exporter (CSV)** gives the same lines to a spreadsheet (semicolons, opens in Excel).
- Payments made online are shown apart ("Payé en ligne, hors caisse"): they are on the
  club's gateway account, not in the till. See `docs/ONLINE_PAYMENT.md`.
- Gifts and corrections of tokens carry no cash and are not in the report.

## Members: blocking, and deleted accounts (Admin → Membres)

- **Bloquer** closes the app to a member: no booking, no order, and a "compte
  suspendu" screen on every page. Their bookings and tokens stay as they are (cancel
  their matches from the planning if needed). An admin is never blocked: remove the
  admin access first. **Débloquer** lets them back in. Both are in the activity feed.
- A member can **delete their own account** (Profil → Supprimer mon compte). It is
  refused while they have a match to come or a boutique order in progress. The tokens
  they still hold are lost: the screen shows how many, and they confirm it. Their
  name, e-mail and phone are erased everywhere; past matches and the token history
  stay, under "Compte supprimé". The same e-mail can sign up again as a new member.

## Peak / off-peak pricing (Admin → Tarifs)

- Base prices are in **Réglages → Tarifs / Tokens** (defaults: 25 TND per player,
  100 per court, 1 token per spot, 4 per court). A court can override the player price.
- A rule sets **tokens per spot** for chosen days and a time range, for all courts or one court.
  The full court then costs tokens per spot × players per match.
  Example: weekdays 17:00–24:00 → 2 tokens/spot (full court = 8 with 4 players).
- Overlapping rules: highest priority wins, then court-specific beats club-wide.
- Rules are evaluated in club time (`CLUB_TIMEZONE`), and apply to **new** bookings only.
- "Prix affiché" (club currency) is shown to walk-ins; token prices are what players pay in the app.

## Equipment rental (Admin → Matériel)

- Catalogue: name, price (club currency, paid at the front desk), stock **per match slot**.
- Players add rackets/balls when booking, or later from Mes réservations → **Matériel**, until
  the match starts. Stock is checked under a
  database lock, so the last racket can't be rented twice.
- **Prep list**: everything to hand out today/tomorrow, grouped by match, with "Remis" / "Rendu".
- Cancelling a booking or leaving a match releases the equipment automatically.

## Recurring bookings (Admin → Réservations → Récurrente)

- Same court and time every 1 or 2 weeks, 2–52 sessions, for a member or a named group.
- **Preview first**: dates already taken are flagged and skipped (never overwritten).
- No tokens are charged: each session gets a pending cash payment to tick off at the desk.
- "Annuler la série" cancels only future sessions; past ones stay in history.

## Notifications

| Event                                                  | In-app | Email | Push |
| ------------------------------------------------------ | ------ | ----- | ---- |
| Welcome (first sign-in)                                | ✓      | ✓     |      |
| Booking / join confirmed (with peak price + equipment) | ✓      | ✓     | ✓    |
| Booking cancelled / left (with refund)                 | ✓      | ✓     | ✓    |
| Reminder before the match (lead time in Réglages)      | ✓      | ✓     | ✓    |
| Personal match invitation (accept / decline)           | ✓      | ✓     | ✓    |
| Match finished: thanks + "book the next one"           | ✓      | ✓     | ✓    |
| Tokens added by the club                               | ✓      | ✓     | ✓    |

- Each type can be switched off for the whole club in **Réglages → Notifications**
  (welcome stays on). Prices, durations and token costs in the texts come from Réglages.
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

- The manifest is generated at build time from `VITE_CLUB_*` (name, colours); `public/sw.js`
  and icons live in `public/`.
- Android/Chrome/Edge: players see an "Installer" card on their dashboard. iPhone: the card explains
  Share → "Sur l'écran d'accueil". Dismissing hides it for 3 weeks.
- The service worker caches the app shell for offline start but **never caches `/api/` responses**,
  so availability is always live. It is disabled inside iframes.
- Home-screen shortcuts: Réserver, Mes réservations.

## Privacy

- Anonymous visitors and other players see names as "Yasmine B." (never an email) in the calendar,
  open matches and invite links. Admins see full names.
