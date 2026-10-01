# Supabase project for a new club

Every club gets **its own Supabase project**: its own database, auth users,
e-mail settings and keys. Never reuse another club's project.

Placeholders: `<project-ref>` (the new project's ref), `<club-domain>`
(e.g. `padel-club.tn`), `<Club name>`.

## 1. Create the project

1. <https://supabase.com/dashboard> → the organisation that will own the club's
   projects (Amivio's, or the customer's own if they pay Supabase directly).
2. **New project**
   - Name: `<club>-padel` (e.g. `marsa-padel`)
   - Database password: generate a strong one, store it in the password manager
     (it goes in `DATABASE_URL`, nowhere else)
   - Region: closest to the club's players (Tunisia → `eu-central-1` Frankfurt or
     `eu-west-3` Paris)
   - Plan: **Pro** for production (daily backups, no pausing, PITR add-on,
     leaked-password protection). Free projects pause after a week of inactivity.
3. Note the **project ref** (Project Settings → General) and the **Project URL**.

## 2. Keys and connection

| Value                        | Where in the dashboard                               | Goes to                                         |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Project URL                  | Project Settings → API                               | `VITE_SUPABASE_URL`, `SUPABASE_URL`             |
| anon / publishable key       | Project Settings → API Keys                          | `VITE_SUPABASE_ANON_KEY` (public)               |
| service_role / secret key    | Project Settings → API Keys                          | `SUPABASE_SERVICE_ROLE_KEY` (**API host only**) |
| Legacy JWT secret (optional) | Project Settings → JWT Keys                          | `SUPABASE_JWT_SECRET` (**API host only**)       |
| Connection string            | **Connect** → Session pooler (IPv4) or Direct (IPv6) | `DATABASE_URL` (**API host only**)              |

## 3. Auth settings

**Authentication → URL Configuration**

| Setting       | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Site URL      | `https://<club-domain>`                                     |
| Redirect URLs | `https://<club-domain>/**`                                  |
|               | `http://localhost:5173/**` only while developing against it |

**Authentication → Sign In / Providers → Email**

- Enable e-mail provider: on · Confirm e-mail: on · Secure e-mail change: on
- Minimum password length 8, letters and digits (matches the sign-up form)
- Leaked password protection: on (Pro)

**E-mails**: custom SMTP is mandatory for real players → `docs/EMAIL_CONFIGURATION.md`.

**Google**: `docs/GOOGLE_AUTH_CONFIGURATION.md` (one Google OAuth client per club).

**Attack Protection**: enable CAPTCHA (Turnstile or hCaptcha) once the site is
public (needs the site key wired in the front-end: not done yet, see
`docs/SECURITY.md`). Raise **Rate Limits → e-mails per hour** after SMTP is set.

## 4. Database schema

From a machine with this repo and the club's `.env` (only `DATABASE_URL` is needed):

```bash
pnpm --filter @workspace/scripts run db:migrate -- --dry-run
pnpm --filter @workspace/scripts run db:migrate
```

or `supabase link --project-ref <project-ref> && supabase db push`, or paste the
output of `pnpm --silent --filter @workspace/scripts run db:bundle` in the SQL
editor (one transaction).

Check in the SQL editor:

```sql
select count(*) from supabase_migrations.schema_migrations;   -- = number of files in supabase/migrations
select * from public.club_settings;                           -- 1 row with the defaults
select count(*) from public.opening_hours;                    -- 7
select count(*) from public.token_ledger_audit;               -- 0
```

Then **Advisors → Security**: no error expected. "RLS enabled, no policy" notices
are intended (browsers have no table access; the API uses `DATABASE_URL`).

## 5. Storage, Realtime, extensions

- Storage: not used by the app (court photos are URLs). Leave buckets private.
- Realtime: the migrations empty the `supabase_realtime` publication on purpose.
- Extensions: `btree_gist` (installed by the migrations in `extensions`).

## 6. Backups and access

- Pro plan: daily backups included; add **PITR** before real money flows.
- Project → Settings → Team: only the people who operate this club. Give the club
  owner dashboard access only if they ask for it.
- Store the database password, service role key and SMTP password in the
  password manager under the club's name.

## 7. First admin

After the website is deployed, the owner signs up, confirms the e-mail, then:

```sql
update public.users set role = 'admin' where email = '<owner-email>';
```
