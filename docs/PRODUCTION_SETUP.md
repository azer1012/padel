# Production setup

Everything the code can't do for you: accounts, secrets, domain and dashboard
settings. Work through it top to bottom; each step says where to click.

```
 Browser ──► Website (static, Vite build)   ──/api──►  API server (Node 20+, Express)
    │                                                     │  DATABASE_URL (privileged)
    └──── Supabase Auth only (sign-up, sign-in, reset) ───┴─► Supabase Postgres
```

The browser talks to Supabase **for authentication only**. All club data goes
through the API, which enforces the booking and token rules. Database roles used
by browsers (`anon`, `authenticated`) have no access to any table.

---

## 1. Database (Supabase project `bnbdeymvdfrklbegwfgd`)

Migrations live in `supabase/migrations/` and are the single source of truth for
the schema. Apply them with either tool (both write the same history table):

```bash
# a) this repo's runner (needs DATABASE_URL in .env or the environment)
pnpm --filter @workspace/scripts run db:migrate -- --dry-run   # what would run
pnpm --filter @workspace/scripts run db:migrate

# b) Supabase CLI
supabase link --project-ref bnbdeymvdfrklbegwfgd
supabase db push
```

- `20260527180000_drop_legacy_uuid_schema.sql` removes a prototype schema
  (profiles / courts / reservation_payments) found on the hosted project. It
  only runs when that schema exists **and is empty**, and otherwise refuses.
- Never run `supabase/rollbacks/*` against production unless you mean to delete data.
- Don't use `drizzle-kit push` against this database (it would drop the
  constraints and triggers that protect bookings and tokens).

### First admin

Sign up on the website with the owner's e-mail, then in the SQL editor:

```sql
update public.users set role = 'admin' where email = '<owner-email>';
```

Further admins can be appointed from **Admin → Membres** (shield icon). The API
refuses to remove the last admin.

### Courts and prices

Create the courts in **Admin → Terrains** (name, indoor/outdoor, opening hours on
the 90-minute grid, price per person, 25 TND by default). Peak hours and tokens
per spot can be tuned in **Admin → Tarifs**.

---

## 2. Supabase Auth settings (dashboard)

### URL Configuration (Authentication → URL Configuration)

| Setting       | Value                                                                 |
| ------------- | --------------------------------------------------------------------- |
| Site URL      | `https://<your-production-domain>`                                    |
| Redirect URLs | `https://<your-production-domain>/**`                                 |
|               | `http://localhost:5173/**` (only if you develop against this project) |

The app redirects to these paths, all covered by the entries above:

| Flow                      | Redirect                                             |
| ------------------------- | ---------------------------------------------------- |
| E-mail confirmation       | the page the player came from (default `/dashboard`) |
| Password reset            | `/reset-password`                                    |
| Google sign-in            | the page the player came from                        |
| Invite link after sign-in | `/join/<token>`                                      |

### E-mail sign-in (Authentication → Sign In / Providers → Email)

- Enable e-mail provider: **on**
- Confirm e-mail: **on** (players must verify their address)
- Secure e-mail change: **on**
- Minimum password length: **8**, password requirements: **letters and digits**
  (matches the sign-up form)
- Leaked password protection: **on** (Pro plan)

### Custom SMTP (required for production)

Supabase's built-in mailer only sends to your organisation's team members and is
heavily rate-limited, so real players would never receive confirmation or reset
e-mails. Configure your own SMTP in **Authentication → Emails → SMTP Settings**:

| Field         | Resend (recommended)     | Brevo                  | Amazon SES                          |
| ------------- | ------------------------ | ---------------------- | ----------------------------------- |
| Host          | `smtp.resend.com`        | `smtp-relay.brevo.com` | `email-smtp.<region>.amazonaws.com` |
| Port          | `465` (or `587`)         | `587`                  | `587`                               |
| User          | `resend`                 | your Brevo SMTP login  | SES SMTP user                       |
| Password      | a Resend API key         | Brevo SMTP key         | SES SMTP password                   |
| Sender e-mail | `no-reply@<your-domain>` | same                   | same                                |
| Sender name   | `Smash Padel`            | same                   | same                                |

Before sending: verify the domain at the provider and publish its **SPF, DKIM and
DMARC** DNS records, or messages land in spam. After enabling SMTP, raise
**Authentication → Rate Limits → e-mails per hour** (it starts at 30).

The API sends its own e-mails (booking confirmations, reminders, tokens credited)
through Resend's HTTP API with `RESEND_API_KEY`. You can reuse the same Resend
account and domain.

### E-mail templates (Authentication → Emails → Templates)

Keep `{{ .ConfirmationURL }}` in every template. Suggested French subjects:

| Template              | Subject                                 |
| --------------------- | --------------------------------------- |
| Confirm signup        | Confirmez votre compte Smash Padel      |
| Reset password        | Réinitialisez votre mot de passe        |
| Change e-mail address | Confirmez votre nouvelle adresse e-mail |

Keep them short and plain (no marketing), as Supabase recommends for deliverability.

### Abuse protection

- Turn on **CAPTCHA** (Authentication → Attack Protection, hCaptcha or Turnstile)
  once the site is public. It needs a site key in the front-end; ask for it to be
  wired when you have the key.
- Google sign-in: see `GOOGLE_AUTH_SETUP.md`.

---

## 3. API server

Any Node 20+ host (Render, Railway, Fly.io, a VPS with PM2…).

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Environment: see the **SERVER ONLY** block of `.env.example`. Required:
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`),
`SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `CORS_ORIGIN`, `TZ=Africa/Tunis`.

- `DATABASE_URL`: use the **Session pooler** string from Dashboard → Connect if the
  host has no IPv6.
- Health check: `GET /api/healthz` → `{"status":"ok"}`.
- Scheduled jobs (reminders 2 h before, "match finished" e-mails): with
  `JOBS_ENABLED=true` the server runs them itself. On serverless hosts set it to
  `false` and call `POST /api/internal/jobs/run` every 5 minutes with header
  `x-cron-secret: <CRON_SECRET>`.
- Behind a proxy: `TRUST_PROXY=true` so rate limiting sees real client IPs.

## 4. Website

```bash
pnpm --filter @workspace/padel-club run build      # → artifacts/padel-club/dist/public
```

Build-time variables: the **PUBLIC** block of `.env.example`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_CLUB_*`,
`VITE_AUTH_GOOGLE_ENABLED`).

Serve `dist/public` as a single-page app (all unknown paths → `index.html`) and
route `/api/*` to the API server, e.g.:

- **Netlify** `_redirects`: `/api/*  https://<api-host>/api/:splat  200` then `/*  /index.html  200`
- **Vercel** `vercel.json` rewrites: `{ "source": "/api/(.*)", "destination": "https://<api-host>/api/$1" }`
- **Nginx**: `location /api/ { proxy_pass http://127.0.0.1:3000; }` + `try_files $uri /index.html;`

Or host the API on its own domain and build the site with
`VITE_API_URL=https://<api-host>` (and put the site's origin in the API's `CORS_ORIGIN`).

Recommended response headers for the website: `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
and long caching for `/assets/*` (hashed files). Don't cache `index.html` or `sw.js`.

---

## 5. Verification before announcing the site

```bash
pnpm run typecheck && pnpm run lint
pnpm --filter @workspace/api-server test        # 38 API integration tests (local Postgres)
pnpm --filter @workspace/scripts run db:test    # SQL invariants (local Postgres)
pnpm run build
```

Then on the real site: sign up with a fresh address → receive and click the
confirmation e-mail → book → invite a friend → cancel; password reset end to end;
an admin credits tokens and marks a cash payment.
