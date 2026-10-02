# E-mail configuration (per club)

Two senders, both on the club's domain:

| Sent by           | What                                                                                       | Configured in                      |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| **Supabase Auth** | sign-up confirmation, password reset, e-mail change                                        | Supabase dashboard → SMTP settings |
| **The API**       | booking confirmations, cancellations, reminders, invitations, tokens credited, after-match | `RESEND_API_KEY`, `EMAIL_FROM`     |

One provider account can serve both (Resend recommended). Each club uses its own
domain and sender; if one Amivio provider account serves several clubs, verify
each club's domain separately.

## 1. Verify the domain at the provider

Resend → Domains → Add `<club-domain>` (or a subdomain such as `mail.<club-domain>`)
and publish the records it gives at the DNS host:

| Record                       | Purpose                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| SPF (TXT)                    | authorises the provider to send                                                        |
| DKIM (TXT/CNAME)             | signs messages                                                                         |
| DMARC (TXT `_dmarc`)         | `v=DMARC1; p=none; rua=mailto:dmarc@<club-domain>` to start, `p=quarantine` once clean |
| MX (if required for bounces) | as given                                                                               |

Wait until the provider shows **Verified**. Without SPF/DKIM/DMARC, messages land in spam.

## 2. Supabase Auth SMTP (mandatory for real players)

Supabase's built-in mailer only sends to the project's team members and is
heavily rate-limited. **Authentication → Emails → SMTP Settings** → enable custom SMTP:

| Field         | Resend                        | Brevo                  | Amazon SES                          |
| ------------- | ----------------------------- | ---------------------- | ----------------------------------- |
| Host          | `smtp.resend.com`             | `smtp-relay.brevo.com` | `email-smtp.<region>.amazonaws.com` |
| Port          | `465` (or `587`)              | `587`                  | `587`                               |
| User          | `resend`                      | Brevo SMTP login       | SES SMTP user                       |
| Password      | a Resend API key (**secret**) | Brevo SMTP key         | SES SMTP password                   |
| Sender e-mail | `no-reply@<club-domain>`      | same                   | same                                |
| Sender name   | `<Club name>`                 | same                   | same                                |

Then **Authentication → Rate Limits → e-mails per hour**: raise it from 30 to a
value that fits the club (e.g. 200).

The SMTP password lives only in the Supabase dashboard (never in the repo or `.env`).

## 3. Auth e-mail templates

**Authentication → Emails → Templates**. Keep them short and plain (better
deliverability), and use the **token-hash link** below instead of the default
`{{ .ConfirmationURL }}`.

Why: the default link only completes in the browser that asked for it. A player
who signs up on a laptop and opens the e-mail on a phone (or in a mail app's
built-in browser) would land on "this link is no longer valid". The token-hash
link opens the site's `/auth/confirm` page, which works on any device.

| Template              | Subject (FR)                            | Link in the body                                                                                        |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Confirm signup        | Confirmez votre compte `<Club name>`    | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`             |
| Reset password        | Réinitialisez votre mot de passe        | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`                                 |
| Change e-mail address | Confirmez votre nouvelle adresse e-mail | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next={{ .SiteURL }}/profile` |
| Magic link            | (unused by the app)                     |                                                                                                         |

`{{ .SiteURL }}` is **Authentication → URL Configuration → Site URL**: it must be
the club's website (`https://<club-domain>`, no trailing slash).

Example body (Confirm signup):

```html
<p>Bonjour,</p>
<p>Confirmez votre adresse pour activer votre compte <Club name> :</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}"
    >Confirmer mon adresse</a
  >
</p>
<p>Si vous n'avez pas créé de compte, ignorez ce message.</p>
```

After confirming, the player is signed in and sent to the page they were heading
to; the password-reset link brings them to `/reset-password`. A template still
using `{{ .ConfirmationURL }}` keeps working, in the same browser only.

## 4. API notification e-mails

API environment:

```
RESEND_API_KEY=<resend-api-key>                      # secret
EMAIL_FROM="<Club name> <notifications@<club-domain>>"
EMAIL_REPLY_TO=contact@<club-domain>
CLUB_NAME="<Club name>"
FRONTEND_URL=https://<club-domain>                   # links in the e-mails
```

Without `RESEND_API_KEY` the API logs e-mails instead of sending them (useful in
development). Players choose e-mail and push in **Profil → Notifications**; the
club switches each type on or off in **Admin → Réglages → Notifications**.
Texts are in French, English or Arabic (the player's language), and quote the
club's own duration, token costs and currency.

## 5. Test

- [ ] Sign up with a fresh Gmail and Outlook address: confirmation arrives in the inbox, not spam
- [ ] Open the confirmation e-mail on **another device** than the one used to sign up: the account opens
- [ ] Password reset arrives and the link opens `/reset-password`, also from another device
- [ ] Book a match: confirmation e-mail with the club name and correct time
- [ ] Credit tokens to a test member: "tokens added" e-mail
- [ ] <https://www.mail-tester.com>: score ≥ 9/10
