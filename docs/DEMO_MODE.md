# Demo mode (public showcase)

An installation with `DEMO_MODE=true` is a **public demo** of the platform for clubs
that might buy it: an invented club, two shared accounts to try it, and everything
back to its starting point every night. It is AmiVio's sales tool, never a club's
site.

## What a visitor gets

- A thin lime bar on every page: "Démo · Club fictif : tout revient à zéro chaque
  nuit à 4 h", with **Contactez AmiVio** (WhatsApp, e-mail).
- On `/sign-in` and `/sign-up`, no form: two buttons, **Côté joueur** and
  **Côté club**, which sign in with the shared accounts:
  - `joueur@example.com`: a member with tokens, bookings, loyalty progress
  - `club@example.com`: the club's admin
- A full club: 4 courts, peak hours, token packs (10 = 200, 20 = 380, 50 = 900 TND),
  loyalty on (1 token → 0.1), 8 invented members, today's and tomorrow's planning,
  3 open matches with spots to take, 4 tournaments with teams, 4 news, the shop with
  6 articles, one order waiting for the call and one confirmed.

Every person is invented and has an `@example.com` address (reserved for examples:
nothing can be delivered there). Phone numbers start with `00`, which no Tunisian
number does.

## What the demo protects

| Risk                                       | What happens                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Somebody signs up for real                 | No sign-up form. An account outside `@example.com` is refused by the API (`DEMO_ACCOUNT_ONLY`), never listed to visitors, and deleted at the next reset.                             |
| A visitor makes themselves or others admin | Role changes are refused (`DEMO_LOCKED`); the buttons are hidden.                                                                                                                    |
| E-mails or push to real people             | None: notifications stay in the app.                                                                                                                                                 |
| A visitor changes or deletes things        | Fine, that's the point. The next reset puts everything back.                                                                                                                         |
| The shared password is changed             | The profile hides it; the reset sets it again. Someone determined can still change it through Supabase directly: sign-in then fails until the next reset (or a manual reset, below). |

## The nightly reset

At `DEMO_RESET_HOUR` (club time, default 4 h) the API empties every table of the club,
deletes everybody except the two shared accounts, and creates the demo club again,
with dates relative to that day. It runs:

- when the API starts, if the last reset is older than the last reset hour (a host
  that slept through the night resets before its first visitor);
- every 5 minutes from the job scheduler (`JOBS_ENABLED=true`), when due;
- on demand: `POST /api/internal/demo/reset` with header `x-cron-secret: <CRON_SECRET>`.

It also makes sure the two shared accounts exist in Supabase Auth, confirmed, with
`DEMO_PASSWORD` (through the service role key).

### Never on a real club's data

The reset refuses to run (and logs why) when the database:

- has members outside `@example.com` with bookings, tokens, orders or tournament
  registrations, or
- has courts but was never reset as a demo (no "Demo data reset" entry in the
  activity trail).

The very first reset of a base that holds hand-made content must be forced, once,
after checking `DATABASE_URL` points to the demo's own database:

```
curl -X POST https://<api-host>/api/internal/demo/reset \
  -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" \
  -d '{"force": true}'
```

## Putting it online

1. A database for the demo only (its own Supabase project), with every migration
   applied. Never a club's project.
2. API (Render, Railway, Fly…), as in `docs/PRODUCTION_DEPLOYMENT.md`, plus:
   `DEMO_MODE=true`, `DEMO_PASSWORD=<8+ characters>`, `CRON_SECRET=<random>`,
   `JOBS_ENABLED=true`.
3. Website as usual. Nothing demo-specific in its build: it reads the demo state from
   `GET /api/settings`.
4. Supabase Auth: e-mail confirmations can stay off (nobody signs up).
5. Open the site: the bar, the two buttons, and a club full of activity.

A host that sleeps when idle (Render's free plan) resets at start-up: the first
visit after a night takes a few seconds longer.
