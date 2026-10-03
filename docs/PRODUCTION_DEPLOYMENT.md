# Production deployment (one club)

How to put one club's installation online: database, API server, website. Do it
once per customer. Their accounts, secrets and domain are theirs; nothing is shared
with any other club.

```
 Browser ──► Website (static, Vite build)   ──/api──►  API server (Node 20+, Express)
    │                                                     │  DATABASE_URL (privileged)
    └──── Supabase Auth only (sign-up, sign-in, reset) ───┴─► Supabase Postgres (this club)
```

The browser talks to Supabase **for authentication only**. All club data goes
through the API, which enforces the booking and token rules. The database roles
used by browsers (`anon`, `authenticated`) can't access any table.

Related guides:

| Topic                                   | Guide                               |
| --------------------------------------- | ----------------------------------- |
| Whole onboarding of a new club          | `docs/NEW_CUSTOMER_SETUP.md`        |
| Creating the club's Supabase project    | `docs/SUPABASE_NEW_CUSTOMER.md`     |
| Domain, DNS and HTTPS                   | `docs/DOMAIN_SETUP.md`              |
| Auth e-mails (SMTP) and API e-mails     | `docs/EMAIL_CONFIGURATION.md`       |
| Google (and Apple) sign-in              | `docs/GOOGLE_AUTH_CONFIGURATION.md` |
| What goes in `.env` vs Admin → Réglages | `docs/CONFIGURATION.md`             |
| Schema, tables, migrations              | `docs/DATABASE.md`                  |

---

## 1. Database

Migrations in `supabase/migrations/` are the single source of truth for the
schema. Apply them to the club's project with either tool (both write the same
history table, `supabase_migrations.schema_migrations`):

```bash
# a) this repo's runner (reads DATABASE_URL from .env or the environment)
pnpm --filter @workspace/scripts run db:migrate -- --dry-run   # what would run
pnpm --filter @workspace/scripts run db:migrate

# b) Supabase CLI
supabase link --project-ref <project-ref>
supabase db push

# c) no CLI access: one transaction to paste in Dashboard → SQL Editor
pnpm --silent --filter @workspace/scripts run db:bundle > apply.sql
```

With (c), paste the **whole** file into the SQL editor (open it in a text editor
or GitHub's Raw view and select all). A file preview that shows only the first
lines leads to `unterminated dollar-quoted string`; nothing is applied in that case.
The bundle used for the existing hosted project is kept in
`supabase/bundles/2026-10-01_hosted_initial.sql`.

Check afterwards:

```sql
select version from supabase_migrations.schema_migrations order by 1;  -- every file of supabase/migrations
select count(*) from public.token_ledger_audit;                       -- 0
select * from public.club_settings;                                   -- 1 row, defaults
```

- `20260527180000_drop_legacy_uuid_schema.sql` only acts on a project that holds
  an old, **empty** prototype schema (profiles / courts / reservation_payments) and
  refuses if it contains data. On a new project it does nothing.
- Never run `supabase/rollbacks/*` against production unless you mean to delete data.
- Don't use `drizzle-kit push` against this database: it would drop the
  constraints and triggers that protect bookings and tokens.

### First admin

Sign up on the website with the owner's e-mail, then in the SQL editor:

```sql
update public.users set role = 'admin' where email = '<owner-email>';
```

Further admins are appointed from **Admin → Membres** (shield icon). The API
refuses to remove the last admin.

### Club rules

Everything operational is set by the owner in the app, not in code or `.env`:
**Admin → Réglages** (duration, players, prices, tokens and packs, booking window,
cancellation, opening hours and holidays, features, notifications) and
**Admin → Terrains** (courts). Defaults: 90-minute matches, 4 players, 25 per
player / 100 per court, 1 token per spot / 4 per court, 08:00–23:00 every day.

---

## 2. Supabase Auth (dashboard)

See `docs/SUPABASE_NEW_CUSTOMER.md` §3 for URL configuration, e-mail provider
settings and abuse protection, `docs/EMAIL_CONFIGURATION.md` for SMTP and
templates, and `docs/GOOGLE_AUTH_CONFIGURATION.md` for Google.

---

## 3. API server

Any Node 20+ host (Render, Railway, Fly.io, a VPS with PM2…). One API per club.

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Environment: the **SERVER ONLY** block of `.env.example`. Required:
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`),
`SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `CORS_ORIGIN`, `TZ` and `CLUB_TIMEZONE`.

- `DATABASE_URL`: the **Session pooler** string from Dashboard → Connect if the
  host has no IPv6.
- Health check: `GET /api/healthz` → `{"status":"ok"}`.
- Scheduled jobs (reminders, "match finished" e-mails): with `JOBS_ENABLED=true`
  the server runs them itself every 5 minutes. On serverless hosts set it to
  `false` and call `POST /api/internal/jobs/run` every 5 minutes with the header
  `x-cron-secret: <CRON_SECRET>`. Reminder timing and on/off switches are in
  **Admin → Réglages → Notifications**.
- `CORS_ORIGIN` is mandatory when `NODE_ENV=production`: the server refuses to
  start without it (comma-separated origins, e.g. `https://club.example`).
- Behind a proxy: `TRUST_PROXY=true` so rate limiting sees real client IPs.
- Settings are cached for 10 s per API instance (the instance that saved them
  sees the change at once). Run a single instance per club, or accept that
  other instances follow within 10 s.

## 4. Website

```bash
pnpm --filter @workspace/padel-club run build      # → artifacts/padel-club/dist/public
```

Build-time variables: the **PUBLIC** block of `.env.example`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_CLUB_*`,
`VITE_AUTH_GOOGLE_ENABLED`). The club name, description and theme colour are
written into `index.html` and the PWA manifest at build time; logo, icons and
photos are files in `artifacts/padel-club/public/` (see `docs/CONFIGURATION.md`).

Serve `dist/public` as a single-page app (unknown paths → `index.html`) and route
`/api/*` to the API server, e.g.:

- **Netlify** `_redirects`: `/api/*  https://<api-host>/api/:splat  200` then `/*  /index.html  200`
- **Vercel** `vercel.json` rewrites: `{ "source": "/api/(.*)", "destination": "https://<api-host>/api/$1" }`
- **Cloudflare Pages**: a `_redirects` file like Netlify's, or a Worker route for `/api/*`
- **Nginx**: `location /api/ { proxy_pass http://127.0.0.1:3000; }` + `try_files $uri /index.html;`

Or host the API on its own domain and build the site with
`VITE_API_URL=https://<api-host>` (and put the site's origin in the API's `CORS_ORIGIN`).

Response headers: the build ships a `_headers` file (read by Netlify and
Cloudflare Pages) with `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, long caching for `/assets/*` and no
caching for `index.html`, `sw.js` and `manifest.webmanifest`. On another host,
set the same headers in its configuration, and add `Strict-Transport-Security`
once HTTPS is confirmed. A Content-Security-Policy is per club (it names the
club's Supabase and API hosts); a starting point:

```
default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; connect-src 'self' https://<project-ref>.supabase.co https://<api-host>;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

---

## 5. Verification before announcing the site

```bash
pnpm run typecheck && pnpm run lint
pnpm --filter @workspace/api-server test        # API integration tests (local Postgres)
pnpm --filter @workspace/scripts run db:test    # SQL invariants (local Postgres)
pnpm run build
```

Then on the real site:

- [ ] Supabase → Authentication: **Confirm email is on**, leaked-password protection is on
- [ ] sign up with a fresh address → receive and click the confirmation e-mail
- [ ] password reset end to end
- [ ] Google sign-in (if enabled)
- [ ] the owner is admin; Réglages and Terrains show the club's values
- [ ] book a full court → invite a friend (link and member invitation) → cancel
- [ ] an admin sells a pack and marks a cash payment; the wallet updates
- [ ] `select count(*) from token_ledger_audit` → 0

---

## 6. Checklists

Tick every line for each club. A line that can't be ticked is a reason not to launch.

### Before deployment

- [ ] **Database migration**: every file of `supabase/migrations` is in the project's history (`pnpm --filter @workspace/scripts run db:migrate -- --dry-run` lists nothing to apply)
- [ ] **RLS**: Supabase → Advisors → Security shows only "RLS enabled, no policy" notices; the `curl` of `docs/TESTING.md` prints 401
- [ ] **Environment**: every `<…>` of `.env.example` is filled on the hosts; `CORS_ORIGIN` and `FRONTEND_URL` are the club's `https://` address; `NODE_ENV=production`
- [ ] **Auth**: Site URL and Redirect URLs are the club's domain; Confirm email on; leaked-password protection on
- [ ] **SMTP**: custom SMTP saved in Supabase; a test e-mail arrived (`docs/EMAIL_CONFIGURATION.md`)
- [ ] **Google** (if sold): client ID and secret saved in Supabase; `VITE_AUTH_GOOGLE_ENABLED=true` (`docs/GOOGLE_AUTH_CONFIGURATION.md`)
- [ ] **Storage**: one bucket, `media`, private (`select id, public from storage.buckets` → `media | false`), no policy on `storage.objects`; the club's own images are in `artifacts/padel-club/public/`
- [ ] **Photo upload**: Admin → Boutique → an article → Choisir une photo: the photo shows in the form, and on `/boutique` once saved
- [ ] **Domain**: DNS points to the website and the API hosts (`docs/DOMAIN_SETUP.md`)
- [ ] **HTTPS**: both hosts answer on `https://` with a valid certificate; `http://` redirects
- [ ] **Build**: `pnpm run build` succeeds with the club's environment
- [ ] **Tests**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run test:e2e` all green on the release being deployed

### Security before launch

- [ ] No secret in the repository (`git grep` for the service-role key and the database password finds nothing)
- [ ] No service-role key, database URL or password in the built website (`grep -r` in `artifacts/padel-club/dist/public`)
- [ ] API authorization, IDOR, admin routes, token and price manipulation, duplicate booking and duplicate debit: covered by `access.test.ts`, `hardening.test.ts` and `integrity.test.ts`, green
- [ ] `CORS_ORIGIN` lists only the club's origin(s) (the API refuses to start without it)
- [ ] `TRUST_PROXY=true` behind a proxy, so the write limiter counts real visitors
- [ ] Errors shown to a visitor never contain a stack trace (`{ error, code }` only)
- [ ] The first admin is the owner's own account; no test account is left

### After deployment (on the real site)

- [ ] **Homepage** loads on the club's domain, with the club's name, logo and colours
- [ ] **Sign-up**: a new address receives the confirmation e-mail and lands signed in
- [ ] **Login** and sign-out; the session survives a reload
- [ ] **Password reset** from the e-mail to the new password
- [ ] **Google** sign-in (if enabled)
- [ ] **Booking**: a full court, then "just my spot"; the slot shows as taken to another account
- [ ] **Tokens**: the desk credits a pack; the wallet shows it; a booking debits it; `select count(*) from token_ledger_audit` → 0
- [ ] **Invitations**: the link and a member invitation both bring a second account into the match
- [ ] **Admin**: Réglages and Terrains show the club's values; a player account is refused on `/admin`
- [ ] **Mobile**: the whole booking on a phone; the site installs to the home screen
- [ ] **Notifications**: the booking e-mail arrives; the reminder arrives before a test match
- [ ] **Errors**: an unknown address shows the "page not found" screen; the API log has no error
