# Supabase Runbook

Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for browser/mobile clients only.

Use `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` only on the server, CI, or local developer machines. Never commit those values.

## Apply Migrations

```bash
corepack pnpm --dir scripts run db:migrate
```

The command reads `.env.local` or `.env` and applies every non-rollback SQL file in `supabase/migrations`.

## Deploy Functions

Install the Supabase CLI, authenticate, then run:

```bash
supabase link --project-ref bnbdeymvdfrklbegwfgd
supabase functions deploy notifications
supabase functions deploy reservation-reminders
supabase functions deploy token-processing
supabase functions deploy expire-invitations
```

Scheduled functions such as `reservation-reminders` and `expire-invitations` should be triggered by Supabase cron or an external scheduler.

