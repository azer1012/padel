# Google sign-in — configuration (per club)

The app code is ready: the "Continue with Google" button, the Supabase OAuth call
(PKCE), the return to the page the player came from, error display, and profile
creation (first/last name and avatar come from Google). Three things are missing,
and only you can provide them: a Google OAuth client, its secret, and your
production domain.

Nothing below is a real value. Replace every `<…>`.

| Placeholder                | What it is                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- |
| `<your-production-domain>` | Where the website is served, e.g. `padel.example.tn` (no `https://`, no `/`) |
| `<project-ref>`            | This club's Supabase project ref (Dashboard → Project Settings → General)    |
| `<Club name>`              | The club's name, as in `VITE_CLUB_NAME`                                      |

---

## 1. Google Cloud Console

Console: <https://console.cloud.google.com/> → create or pick a project (one per club, e.g. "<Club name> — sign-in").

### 1.1 Branding (OAuth consent screen)

Google Auth Platform → **Branding** (<https://console.cloud.google.com/auth/branding>)

| Field                 | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| App name              | `<Club name>` (what players see on the Google screen)                   |
| User support email    | a mailbox you read                                                      |
| App logo              | `artifacts/padel-club/public/icon-512.png` (optional)                   |
| Application home page | `https://<your-production-domain>`                                      |
| Privacy policy link   | `https://<your-production-domain>/<privacy-page>` (required to publish) |
| Authorized domains    | `<your-production-domain>` and `supabase.co`                            |
| Developer contact     | your e-mail                                                             |

**Audience**: _External_. While the app is in _Testing_, only listed test users can
sign in. Click **Publish app** when you go live (the basic scopes below don't need
Google's verification).

### 1.2 Scopes

Google Auth Platform → **Data Access**: keep only

- `openid` (add it manually)
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

Don't add other scopes: sensitive scopes trigger a long Google review.

### 1.3 OAuth client

Google Auth Platform → **Clients** → **Create client** → type **Web application**,
name "<Club name> web".

**Authorized JavaScript origins**

```
https://<your-production-domain>
http://localhost:5173            ← development only, remove when live
```

**Authorized redirect URIs** (exactly this, it's Supabase's callback, not your site):

```
https://<project-ref>.supabase.co/auth/v1/callback
```

If you later add a Supabase custom domain (e.g. `auth.<your-domain>`), add
`https://auth.<your-domain>/auth/v1/callback` too.

Click **Create**, then copy the **Client ID** (`….apps.googleusercontent.com`) and
the **Client secret**. Store the secret in a password manager, never in the repo.

---

## 2. Supabase dashboard

### 2.1 Google provider

Authentication → **Sign In / Providers** → **Google** → enable

| Field             | Value                       |
| ----------------- | --------------------------- |
| Client IDs        | the Client ID from step 1.3 |
| Client Secret     | the Client secret from 1.3  |
| Skip nonce checks | off                         |

The page shows the **Callback URL** it expects; it must equal the redirect URI you
entered in Google (`https://<project-ref>.supabase.co/auth/v1/callback`).

### 2.2 URL configuration

Authentication → **URL Configuration**

| Setting       | Value                                         |
| ------------- | --------------------------------------------- |
| Site URL      | `https://<your-production-domain>`            |
| Redirect URLs | `https://<your-production-domain>/**`         |
|               | `http://localhost:5173/**` (development only) |

The app sends players back to the page they started from (`/terrains`,
`/join/<invite>`…), which is why the production entry ends with `/**`. Don't add
wildcards for other domains, and remove the localhost entry if you don't develop
against the production project.

---

## 3. Turn the button on

In the website's build environment (Vercel / Netlify / Cloudflare Pages / `.env`):

```
VITE_AUTH_GOOGLE_ENABLED=true
```

Rebuild and redeploy the website. The button stays hidden until then, so players
never hit a "provider is not enabled" error.

---

## 4. Test checklist

- [ ] Sign-in page shows **Continue with Google**
- [ ] Google screen shows the club's name and logo
- [ ] After choosing an account you land back on the page you came from, signed in
- [ ] Profile shows your Google first and last name (created by the database trigger)
- [ ] Signing in again with the same Google account doesn't create a second member
- [ ] A player who first registered with e-mail + password, **confirmed** that e-mail,
      then uses Google with the same address lands on the **same** account
      (Supabase links identities that share a verified e-mail)
- [ ] Cancelling on the Google screen brings you back to sign-in with a readable message

## Notes

- **Account linking**: automatic linking only happens for verified e-mails. An
  e-mail/password account that never confirmed its address won't be merged.
- **Installed app (PWA) on iPhone**: Google's page opens outside the installed app,
  so on some iOS versions the session ends up in Safari instead of the home-screen
  app. E-mail + password sign-in doesn't have this limitation.
- **Trust**: without a Supabase custom domain, Google's screen says "to continue to
  <project-ref>.supabase.co". A custom domain (Supabase paid add-on) shows
  your own domain instead.

## Apple (prepared, not active)

The sign-in page already contains a "Continue with Apple" button behind
`VITE_AUTH_APPLE_ENABLED` (default `false`), using the same Supabase OAuth flow as
Google. To turn it on for a club you need, from an **Apple Developer account**
(paid): a Services ID, a Sign in with Apple key (`.p8`), the Team ID and Key ID.
Enter them in Supabase → Authentication → Sign In / Providers → Apple, add
`https://<project-ref>.supabase.co/auth/v1/callback` as the Return URL in Apple's
console, then build the site with `VITE_AUTH_APPLE_ENABLED=true`. Apple only
returns the player's name on the very first sign-in: the profile trigger stores it.
Test it like Google (checklist above) before announcing it.
