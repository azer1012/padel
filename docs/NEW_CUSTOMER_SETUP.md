# New customer setup (one club)

The full path from a signed contract to a live club. Each club = its own
Supabase project, its own deployment, its own domain, its own secrets. Same
codebase for everyone: **no code change per club**, only environment, branding
assets and the club's own settings.

Estimated effort: half a day of setup + DNS/e-mail propagation + a training session.

---

## Phase 1 — Collect from the customer

| Item                                                                                            | Used for                                               |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Club name (long and short), one-line description                                                | `VITE_CLUB_NAME`, `_SHORT_NAME`, `_DESCRIPTION`        |
| Logo (SVG preferred), brand colours, fonts if any                                               | branding                                               |
| Photos: courts (indoor/outdoor), hero, tournament                                               | `public/*.webp`, `opengraph.jpg`                       |
| Address, city, country, map query, phone, WhatsApp, e-mail, Instagram, Facebook                 | `VITE_CLUB_*`                                          |
| Time zone                                                                                       | `TZ`, `CLUB_TIMEZONE`, `VITE_CLUB_TIMEZONE`            |
| Domain (owned by the customer, or to buy) and who manages its DNS                               | `docs/DOMAIN_SETUP.md`                                 |
| Owner's e-mail (first admin) and other staff e-mails                                            | admin accounts                                         |
| Courts: names, numbers, indoor/outdoor, any court with its own price or hours                   | Admin → Terrains                                       |
| Match duration, players per match, prices per player / court, token price and packs, peak hours | Admin → Réglages / Tarifs                              |
| Opening hours per weekday, known holidays                                                       | Admin → Réglages → Horaires                            |
| Cancellation policy, booking window                                                             | Admin → Réglages → Réservations                        |
| Features wanted: open matches, invitations, pay at the club; Google sign-in?                    | Réglages → Fonctionnalités, `VITE_AUTH_GOOGLE_ENABLED` |

## Phase 2 — Accounts and infrastructure

1. **Supabase**: create the club's project → `docs/SUPABASE_NEW_CUSTOMER.md` §1–2.
2. **Hosting**: one website site (Vercel / Netlify / Cloudflare Pages) and one
   API service (Render / Railway / Fly / VPS) named after the club.
3. **E-mail provider**: add and verify the club's domain → `docs/EMAIL_CONFIGURATION.md` §1.
4. **Push keys** (optional): `npx web-push generate-vapid-keys` (one pair per club).
5. Store every secret in the password manager under the club's name.

## Phase 3 — Configuration

1. Create the club's `.env` from `.env.example` (kept outside this repo, e.g. in
   the password manager or a private per-club folder). Fill PUBLIC and SERVER ONLY.
2. Branding (`docs/CONFIGURATION.md` §2): `VITE_CLUB_*`, replace the images in
   `artifacts/padel-club/public/` (logo, favicon, icons, photos, `opengraph.jpg`)
   and, if needed, the colour tokens in `src/index.css`. Build once locally
   (`pnpm --filter @workspace/padel-club run build`) and look at the result.
3. Hosting environment variables: PUBLIC block on the website host, SERVER ONLY
   block on the API host. Never put a server secret in a `VITE_` variable.

## Phase 4 — Database and auth

1. Apply the migrations → `docs/SUPABASE_NEW_CUSTOMER.md` §4, run the checks.
2. Auth URL configuration, e-mail provider settings, SMTP and templates →
   `docs/SUPABASE_NEW_CUSTOMER.md` §3 and `docs/EMAIL_CONFIGURATION.md` §2–3.
3. Google sign-in if wanted → `docs/GOOGLE_AUTH_CONFIGURATION.md`, then
   `VITE_AUTH_GOOGLE_ENABLED=true`.

## Phase 5 — Deploy

1. API: build and start → `docs/PRODUCTION_DEPLOYMENT.md` §3. Check
   `https://<api-host>/api/healthz` and `https://<api-host>/api/settings`.
2. Website: build with the club's variables and deploy → §4. Route `/api/*`.
3. Domain and HTTPS → `docs/DOMAIN_SETUP.md`; update every place listed there.
4. Jobs: `JOBS_ENABLED=true` on a long-running host, or a 5-minute cron calling
   `/api/internal/jobs/run` with `CRON_SECRET`.

## Phase 6 — Club setup (with the owner)

1. Owner signs up on the site, confirms the e-mail; make them admin
   (`docs/SUPABASE_NEW_CUSTOMER.md` §7).
2. **Admin → Terrains**: create the courts (name, number, type, photo, order,
   optional price/hours override).
3. **Admin → Réglages**: duration, players, booking window, cancellation,
   currency and prices, tokens and packs, weekly hours and holidays, features,
   notifications. Each section saves on its own and can be reset to defaults.
4. **Admin → Tarifs**: peak / off-peak / weekend rules if any.
5. **Admin → Membres**: promote staff to admin.
6. Optional content: news, tournaments, equipment catalogue.

## Phase 7 — Acceptance and handover

Run the checks in `docs/PRODUCTION_DEPLOYMENT.md` §5 on the real site, then:

- [ ] sign-up confirmation and password reset e-mails arrive (not in spam)
- [ ] Google sign-in works (if enabled) and shows the club's name
- [ ] the planning shows the club's courts, hours and duration; a holiday shows as closed
- [ ] a player books a full court with tokens, invites a friend (link + member invitation), cancels → refund
- [ ] the desk sells a pack: balance and cash amount appear in the token history
- [ ] a cash spot is marked paid by staff
- [ ] changing a price in Réglages changes the next booking's price
- [ ] `select count(*) from public.token_ledger_audit` → 0
- [ ] backups (Pro/PITR) and team access reviewed

Hand over: admin training (planning, desk booking, tokens, Réglages), the
support contact, and what the club can change alone (everything in Réglages and
Terrains) versus what goes through Amivio (branding, domain, e-mail sender,
sign-in providers).

---

## Updating every club later

Same code for all clubs. For a release:

1. Merge and test on `main` (`pnpm run typecheck && pnpm run lint`, API tests,
   `db:test`, build).
2. For each club: apply new migrations to its project (`db:migrate` with that
   club's `DATABASE_URL`), then redeploy its API and website with its own `.env`.
3. A new setting arrives with a database default, so clubs keep working without
   any action; tell them when there is something new in Réglages.
