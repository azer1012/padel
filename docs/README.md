# Documentation

One codebase, one installation per club: its own Supabase project, database,
domain and deployment. Branding is prepared per club before delivery; the club
runs its own rules from **Admin → Réglages**.

## Selling and setting up a club

| Guide                          | Read it when                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| `NEW_CUSTOMER_SETUP.md`        | onboarding a new club, start to launch (start here)              |
| `SUPABASE_NEW_CUSTOMER.md`     | creating and configuring the club's Supabase project             |
| `CONFIGURATION.md`             | deciding what is `.env`, what is branding, what is Réglages      |
| `DOMAIN_SETUP.md`              | connecting the club's domain, DNS and HTTPS                      |
| `EMAIL_CONFIGURATION.md`       | sign-up / reset e-mails (SMTP) and the club's notification mails |
| `GOOGLE_AUTH_CONFIGURATION.md` | turning on Google sign-in                                        |
| `PRODUCTION_DEPLOYMENT.md`     | deploying the database, the API and the website; final checks    |

## Running a club

| Guide           | Read it when                                                          |
| --------------- | --------------------------------------------------------------------- |
| `OPERATIONS.md` | pricing rules, equipment, recurring bookings, notifications, the desk |

## Working on the product

| Guide                 | Read it when                                                      |
| --------------------- | ----------------------------------------------------------------- |
| `ARCHITECTURE.md`     | where each responsibility lives: auth, bookings, tokens, pricing… |
| `DATABASE.md`         | tables, the rules the database guarantees, dates and times        |
| `DATABASE_DIAGRAM.md` | the entity-relationship diagram                                   |
| `SECURITY.md`         | who can reach what, secrets, known risks                          |
| `TESTING.md`          | running the test suites, what each one proves                     |
| `DESIGN_SYSTEM.md`    | UI building blocks                                                |
| `AUDIT_REPORT.md`     | the audits done on the platform: what was found, fixed, left open |
