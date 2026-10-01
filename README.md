# Smash Padel

Padel club platform: visitor site, player app and club admin (`artifacts/padel-club`), backed by an Express API (`artifacts/api-server`) on Supabase.

## Getting started

Requires Node 20+. This is a pnpm workspace, install once with:

```bash
corepack pnpm install
```

Then start everything:

```bash
npm run dev
```

- **With a configured `.env`**: starts the API (rebuilt and restarted on every change) and the website on http://localhost:5173, which proxies `/api` to the API.
- **Without one**: starts the website in demo mode, on an in-memory club, and lists the variables still missing.

To connect a backend, copy `.env.example` to `.env` and fill in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`. To force demo mode anyway: `npm run dev:demo`.
