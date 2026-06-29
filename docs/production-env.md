# Production Environment

Set these variables in the hosting provider for the API server, web app, and any Expo build profile.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` server only
- `DATABASE_URL` server only
- `CORS_ORIGIN`
- `FRONTEND_URL`

Do not commit real service-role keys or database passwords. `.env.local` is for local development only and is ignored by git.
