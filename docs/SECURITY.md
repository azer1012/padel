# Security model

## Access

| Who                        | Can reach                               | Enforced by                                                                                                      |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Browser (anon / signed in) | Supabase **Auth** only                  | every `public` table revoked from `anon` and `authenticated`, RLS on, no policies, nothing published to Realtime |
| Browser → API              | `/api/*` with the Supabase access token | `requireUser` / `requireAdmin` (role read from `public.users`, never from the token)                             |
| API                        | the database, as a privileged role      | business rules in the API **and** constraints/triggers in the database                                           |

Because browsers can't touch tables, a player can't raise their balance, mark
themselves paid, add themselves to a match, or edit someone else's data, even
with the anon key and their own JWT in hand. Tables created later are private by
default (`alter default privileges`).

## Rules the database itself guarantees

These hold even if the API has a bug. They're tested in `supabase/tests/db-invariants.sql`.

| Rule                                            | Mechanism                                                   |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Two confirmed bookings never overlap on a court | exclusion constraint `reservations_no_overlap` (btree_gist) |
| A match never has more players than spots       | trigger `reservation_players_capacity` (row lock + count)   |
| A player is in a match at most once             | unique (`reservation_id`, `user_id`)                        |
| A balance is never negative                     | `check (token_balance >= 0)`                                |
| Every balance change has a ledger entry         | deferred constraint trigger `users_token_balance_ledger`    |
| The ledger is never edited or deleted           | trigger `token_transactions_append_only`                    |
| The same admin action can't credit twice        | unique `token_transactions.idempotency_key`                 |
| Profile created for every account               | trigger on `auth.users`                                     |

`select * from public.token_ledger_audit;` lists any account whose balance
doesn't match its last ledger entry. It should always be empty.

## Rules the API enforces

- Bookings sit on the court's 90-minute grid, inside opening hours, in the future.
- Prices come from the server (pricing rules), never from the request.
- Tokens move only through `moveTokens()` inside the booking transaction: a
  refused booking costs nothing.
- Full court: the booker pays 4 spots and is the only one who can hand out invite
  links. Invited friends join as `invited_free`.
- Own spot: others join with a token or `cash_club` (pending until staff mark it paid).
- Only `cash_club` spots can be marked paid or unpaid by hand. Token spots follow
  the ledger.
- Players cancel or leave only before the match (`CANCELLATION_NOTICE_HOURS`). Every
  token-paid spot is refunded exactly once.
- Admins can't silently cancel through `PATCH` (no refund path). The last admin
  can't be demoted.
- Invite tokens are 144-bit random and stop working at kickoff or cancellation.
- Public endpoints return first names and an initial only, never e-mails, phones
  or payment states.
- Inputs validated and size-limited, JSON body ≤ 100 kB, uniform JSON errors
  without stack traces, `X-Content-Type-Options`/`X-Frame-Options`/`no-store`
  headers, per-IP write rate limit.

## Secrets

| Secret                                               | Where it lives            |
| ---------------------------------------------------- | ------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                          | API host environment only |
| `DATABASE_URL` (password)                            | API host environment only |
| `SUPABASE_JWT_SECRET`                                | API host environment only |
| `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` | API host environment only |
| Google client secret, SMTP password                  | Supabase dashboard only   |

Only `VITE_*` variables reach the browser bundle (`envPrefix: ["VITE_"]`). No
secret is committed. `.env` is git-ignored. The anon/publishable key is public by
design.

## Remaining risks and recommendations

- **No CAPTCHA on sign-up**: bots can create accounts and burn the SMTP quota.
  Enable Supabase Attack Protection (Turnstile/hCaptcha) and wire the site key.
- **Rate limit is per API instance and per IP**: with several instances or behind
  a shared NAT it's approximate. Add an edge limit (Cloudflare) for strict control.
- **Cash spots can be held without paying**: a player can reserve an open spot
  "pay at the club" and not show up. It's the agreed business model; staff can
  remove the player from the match. Consider a cut-off or a no-show policy.
- **Token verification**: with `SUPABASE_JWT_SECRET` the API trusts a token until
  it expires (default 1 h) even after sign-out. Without it, the API asks Supabase
  Auth on every request (slower, but revocation is immediate).
- **Admin accounts** have full control of balances: use strong passwords and MFA
  for staff (Supabase Auth MFA can be enabled per user).
- **Activity log** is append-only by convention, not by trigger. The token ledger
  is the authoritative financial record.
- **Backups**: enable Point-in-Time Recovery (Pro plan) before real money flows.
