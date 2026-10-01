# Domain, DNS and HTTPS

One domain (or subdomain) per club, e.g. `padel-club.tn` or `club.example.com`.
The website and the API can share it (recommended, no CORS) or use two hosts.

## Recommended layout

| Host                        | Serves                                             |
| --------------------------- | -------------------------------------------------- |
| `https://<club-domain>`     | the website (static) + `/api/*` proxied to the API |
| `https://api.<club-domain>` | optional: the API on its own host                  |

With a single domain, build the website without `VITE_API_URL` and let the host
route `/api/*` to the API (see `docs/PRODUCTION_DEPLOYMENT.md` §4). With two
hosts, build with `VITE_API_URL=https://api.<club-domain>` and set the API's
`CORS_ORIGIN=https://<club-domain>`.

## DNS records

At the registrar (or Cloudflare if DNS is delegated there):

| Record                            | Type        | Value                                                                    |
| --------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `<club-domain>` (apex)            | A / ALIAS   | the website host's address (given by Vercel, Netlify, Cloudflare Pages…) |
| `www`                             | CNAME       | `<club-domain>` or the host's target (redirect www → apex)               |
| `api` (if separate)               | CNAME / A   | the API host (Render, Railway, Fly, VPS…)                                |
| e-mail sending (SPF, DKIM, DMARC) | TXT / CNAME | from the e-mail provider, see `docs/EMAIL_CONFIGURATION.md`              |

Keep TTLs low (300 s) during the switch, raise them afterwards.

## HTTPS

All the suggested hosts issue certificates automatically (Let's Encrypt) once
DNS points to them. On a VPS: Caddy (automatic) or Nginx + certbot. Force HTTPS
and send `Strict-Transport-Security: max-age=31536000` once it works.

## Everything that must contain the domain

When the domain is live (or changes), update all of these, then redeploy:

| Place                                                   | Value                                 |
| ------------------------------------------------------- | ------------------------------------- |
| website build env `VITE_SITE_URL`                       | `https://<club-domain>`               |
| API env `FRONTEND_URL`, `CORS_ORIGIN`                   | `https://<club-domain>`               |
| API env `EMAIL_FROM`, `EMAIL_REPLY_TO`, `VAPID_SUBJECT` | addresses on the club's domain        |
| Supabase → Auth → URL Configuration                     | Site URL + `https://<club-domain>/**` |
| Google Cloud → OAuth client → JavaScript origins        | `https://<club-domain>`               |
| Google Cloud → Branding → authorized domains            | `<club-domain>`                       |
| SMTP provider → verified domain                         | `<club-domain>`                       |

Invite links and e-mail buttons use `FRONTEND_URL`; canonical URL, sitemap and
Open Graph use `VITE_SITE_URL`.

## Optional: Supabase custom domain

Google's sign-in screen says "continue to `<project-ref>.supabase.co`" unless
the project has a custom domain (Supabase paid add-on), e.g. `auth.<club-domain>`.
If you add one: CNAME as Supabase instructs, then use it in `VITE_SUPABASE_URL`
and add `https://auth.<club-domain>/auth/v1/callback` to Google's redirect URIs.
