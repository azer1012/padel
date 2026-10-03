# Security model

Each club is a separate installation with its own Supabase project, database,
keys and deployment: one club's data can't be reached from another club's site,
because they share no database and no credentials.

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
| Club settings stay in range, one row only       | CHECK constraints on `club_settings` / `opening_hours`      |
| The ledger is never edited or deleted           | trigger `token_transactions_append_only`                    |
| The same admin action can't credit twice        | unique `token_transactions.idempotency_key`                 |
| Profile created for every account               | trigger on `auth.users`                                     |

`select * from public.token_ledger_audit;` lists any account whose balance
doesn't match its last ledger entry. It should always be empty.

## Rules the API enforces

- Bookings sit on the grid of the club's match duration, inside the day's opening
  hours (weekly hours, court override, holidays and exceptions), on an active court
  not in maintenance, and — for players — inside the booking window (minimum notice,
  maximum days ahead). All read from the database, never from the request.
- Prices and token costs come from the server (Réglages, court override, pricing
  rules), never from the request. Spots per match come from the settings.
- Tokens move only through `moveTokens()` inside the booking transaction: a
  refused booking costs nothing.
- Full court: the booker pays the full-court price and is the only one who can hand
  out invites. Invited friends join as `invited_free`.
- Personal invitations: only the invited member can accept or decline; member
  search needs a login and returns "First L." names only (an exact e-mail finds a
  member without revealing anyone's address; LIKE wildcards are escaped).
- Features switched off in Réglages are refused by the API (`FEATURE_DISABLED`),
  not just hidden. "Pay at the club" off → players can only use tokens.
- Own spot: others join with a token or `cash_club` (pending until staff mark it paid).
- Only `cash_club` spots can be marked paid or unpaid by hand. Token spots follow
  the ledger.
- Players cancel or leave only before the match and within the club's cancellation
  deadline; after it, either refused or allowed without refund of their own tokens
  (Réglages). Other players' tokens are always refunded, exactly once.
- Settings: admin only, zod-validated (unknown fields refused, so `id` /
  `updatedBy` can't be injected), every change logged with old → new values.
- Admins can't silently cancel through `PATCH` (no refund path). The last admin
  can't be demoted.
- Invite tokens are 144-bit random and stop working at kickoff or cancellation.
- Public endpoints return first names and an initial only, never e-mails, phones
  or payment states.
- Members of the same match see each other's name ("First L.") only. E-mail,
  phone, token balance and auth id of another member are sent to admins alone;
  the booker's notes and a guest's phone stay with the booker and the staff.
- A member can only remove their own push subscription.
- Staff actions are written to the audit trail with the admin's name: token
  moves, cash payments marked, role changes, court and pricing changes, settings,
  members blocked or unblocked, teams taken out of a tournament, refunds recorded.
- A blocked member is refused by every signed-in route (`ACCOUNT_BLOCKED`), whatever
  their session; an admin is never blocked, nor oneself.
- A member deletes only their own account, after confirming it and the tokens they
  give up (the number is checked against the balance under a row lock). The profile is
  anonymised, the sign-in record deleted in the same transaction, and the old session
  cannot recreate the profile (`ACCOUNT_DELETED`). The ledger and past matches stay.
- The cash report is an admin route; it reads what was recorded (ledger cash amounts,
  spots marked paid, orders handed over), it never takes an amount from the browser.

## Uploaded photos

- Only an admin uploads (`POST /api/admin/media`), one file per request, 5 MB at most.
- What a file is comes from its first bytes, never from the request's `Content-Type`
  or a file name: JPEG, PNG and WebP only. SVG and HTML, which can carry script, are
  refused whatever they claim to be.
- The file is stored under a random 128-bit name chosen by the API; nothing the
  browser sends becomes a path. A name that does not have that exact shape never
  reaches the storage (no path traversal).
- The bucket is **private** and has no policy: no browser role reads or writes it.
  The API uploads with the service role key and serves the photos itself, with the
  stored type, `X-Content-Type-Options: nosniff` and a long cache (a name is never
  reused). Photos are public by nature (they are on public pages); nothing private
  goes into this bucket.
- The website re-encodes a photo through a canvas before sending it, which drops the
  camera's metadata (GPS position, device). A file sent straight to the API by an
  admin is stored as it is.
- Uploads are refused in the public demo.

## Online payment

Details in `docs/ONLINE_PAYMENT.md`. What the API enforces:

- The amount comes from the club's packs, token price or the order's total, never
  from the request; a member only pays their own order.
- The member's return, the gateway's callback and the scheduler only make the API
  **ask the gateway**: the callback routes are public and carry no authority. A
  payment is settled when the gateway itself answers "paid" for the amount asked;
  any other amount closes it as failed and credits nothing.
- Settling locks the payment row and writes the ledger with a key that exists once
  (`payment:<id>`): checked ten times, a payment credits once.
- A member reaches only their own payments; the list and the refund record are admin
  routes. The platform never sends money: a refund is made by the club at the
  gateway, then recorded.
- The stand-in gateway of the test suites (`PAYMENT_PROVIDER=test`) and its routes
  exist only with `NODE_ENV=test`; the API refuses to start with it otherwise.
- No card data ever reaches the platform: the member types it on the gateway's page.
- Inputs validated and size-limited, JSON body ≤ 100 kB, uniform JSON errors
  without stack traces, `X-Content-Type-Options`/`X-Frame-Options`/`no-store`
  headers, per-IP write rate limit, per-member limit on the member search.
- In production the API refuses to start without `CORS_ORIGIN`: it never answers
  browsers of unknown websites.

## Secrets

| Secret                                               | Where it lives            |
| ---------------------------------------------------- | ------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                          | API host environment only |
| `DATABASE_URL` (password)                            | API host environment only |
| `SUPABASE_JWT_SECRET`                                | API host environment only |
| `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` | API host environment only |
| `KONNECT_API_KEY`, `FLOUCI_PRIVATE_KEY` (the club's) | API host environment only |
| Google client secret, SMTP password, Apple key       | Supabase dashboard only   |

Only `VITE_*` variables reach the browser bundle (`envPrefix: ["VITE_"]`). No
secret is committed. `.env` is git-ignored. The anon/publishable key is public by
design. No Supabase project ref, URL or key is hard-coded in the source: they
come from each club's environment (`.env.example` only has placeholders).
Per club: separate database password, service role key, JWT secret, VAPID keys,
cron secret and Google client — never reuse them across clubs.

## Remaining risks and recommendations

- **Confirm e-mail must be on** (Supabase → Authentication → Sign In / Providers →
  Email). With it off, anyone can create an account with an address they don't own.
  It needs working SMTP first (`docs/EMAIL_CONFIGURATION.md`).
- **Leaked-password protection** (Authentication → Attack Protection) is off by
  default: turn it on.
- **The public planning shows "First L." of the players of every match** to
  visitors who are not signed in. It's a product choice (members find each other);
  tell the club, and hide names for visitors if the club prefers.
- **Online payment is not proven against the real gateways**: the Konnect and Flouci
  adapters follow their published documentation and are tested against a local
  server. Run the checklist of `docs/ONLINE_PAYMENT.md` with the club's test keys
  before switching a club to production keys.
- **A blocked member with `SUPABASE_JWT_SECRET` set** is refused at once (the block is
  read from the database on every request); only the Supabase session itself lives
  until it expires, and opens nothing.

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
