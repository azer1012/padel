# Database

One Postgres database (one Supabase project) per club. There is no `tenant_id` or
`club_id`: every row belongs to the one club of this installation.

- **Schema source of truth**: `supabase/migrations/*.sql`, applied in file order.
  `lib/db/src/schema/*.ts` (Drizzle) mirrors it for typed queries in the API and is
  never used to push the schema.
- **Access**: only the API server reads and writes, through `DATABASE_URL`.
  Browser roles (`anon`, `authenticated`) are revoked on every table, RLS is on
  with no policies, and tables created later are private by default. The browser
  uses Supabase for authentication only.
- **Diagram**: `docs/DATABASE_DIAGRAM.md`.

## Tables

### Club configuration (edited in Admin → Réglages / Terrains)

| Table                 | Purpose                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `club_settings`       | **Exactly one row** (`id = 1`, enforced by CHECK). Booking, pricing, token, feature and notification settings — see below.   |
| `opening_hours`       | 7 rows, one per weekday (0 = Sunday): `is_closed`, `open_time`, `close_time` (`24:00` allowed = midnight).                   |
| `schedule_exceptions` | Holidays, closures, special hours, maintenance days. `terrain_id` NULL = whole club. One per (date, court).                  |
| `token_packages`      | Packs sold at the desk (name, tokens, price, on sale, order). Seeded: 10 = 250, 20 = 480, 50 = 1150.                         |
| `terrains`            | Courts: name, number, description, indoor/outdoor, photos, display order, active, maintenance (+ note), archived, overrides. |
| `pricing_rules`       | Peak / off-peak / weekend rules: days, time range, tokens per spot, optional price, priority, optional court.                |

`club_settings` columns (defaults in brackets; ranges are CHECK constraints and
are also validated by the API):

| Group         | Columns                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking       | `booking_duration_minutes` [90, 30–240, ×5], `min_players` [1], `max_players` [4] (1–8, min ≤ max), `min_advance_minutes` [30], `max_advance_days` [14]                      |
| Cancellation  | `cancellation_notice_hours` [0], `late_cancellation` [`forbid` \| `no_refund`]                                                                                               |
| Pricing       | `currency` [TND], `player_price` [25], `full_court_price` [100]                                                                                                              |
| Tokens        | `token_cost_player` [1], `token_cost_full_court` [4], `token_unit_price` [25], `token_min_purchase` [1]                                                                      |
| Features      | `open_matches_enabled`, `invitations_enabled`, `cash_payment_enabled` [all true]                                                                                             |
| Notifications | `booking_confirmation_…`, `reminders_enabled`, `reminder_lead_minutes` [120], `cancellation_…`, `invitation_…`, `token_…`, `match_finished_notifications_enabled` [all true] |
| Audit         | `updated_at`, `updated_by` (admin); every change is also written to `activity` (`settings_updated`) with old → new values                                                    |

Court overrides: `terrains.price_per_person`, `opening_time`, `closing_time` are
NULL by default = use the club settings / weekly hours. Set both times or neither.
Spots per match come from `club_settings.max_players` (kept on each booking as `total_spots`).

### Members and money

| Table                | Purpose                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | App profile of each Supabase Auth user (created by trigger on `auth.users`): names, phone, gender (`male` \| `female`, asked at signup), role (`admin` \| `player`), language, `token_balance`, notification prefs. |
| `token_transactions` | **Append-only ledger**: credit / debit / adjustment, `amount`, `balance_after`, admin, reservation, `cash_amount`, `package_id`, `idempotency_key`.                                                                 |

### Bookings

| Table                   | Purpose                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservations`          | One booked slot on one court: start/end (end = start + duration at booking time), mode (`full_court` \| `own_spot`), `total_spots`, status, public flag. |
| `reservation_players`   | Who plays, and how each paid: `token` / `cash_club` / `invited_free`; status `paid` / `pending` / `refunded`; tokens charged.                            |
| `player_invites`        | Shareable invite links (and QR) and personal invitations (`invited_user_id`): status `pending` / `accepted` / `declined` / `expired` / `cancelled`.      |
| `reservation_series`    | Recurring bookings created by staff (each session is a normal reservation).                                                                              |
| `reservation_equipment` | Rental equipment attached to a booking.                                                                                                                  |
| `equipment_items`       | Rental catalogue and stock.                                                                                                                              |

### Communication and content

| Table                                             | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `notifications`                                   | In-app notifications.                                                                   |
| `notification_log`                                | One row per (user, kind, ref) sent: makes every notification idempotent across retries. |
| `push_subscriptions`                              | Web push endpoints per device.                                                          |
| `activity`                                        | Audit trail of staff and booking events (see "Audit trail" below).                      |
| `news`, `tournaments`, `tournament_registrations` | Club content.                                                                           |

There is no table of clubs and no staff table: branding is per installation
(`VITE_CLUB_*`), staff are `users.role = 'admin'`. The prototype's `clubs` and
`staff_roles` tables were dropped by `20261006000000`.

### Views

| View                 | Purpose                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `token_ledger_audit` | Accounts whose balance doesn't match their last ledger entry. Must be empty. |
| `open_matches`       | Public matches with open spots (`security_invoker`).                         |

### Audit trail (`activity.type`)

| Type                                           | Written when                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `reservation_created`, `reservation_cancelled` | a booking, a slot block, a recurring series, a cancellation (with the admin) |
| `token_credited`, `token_debited`              | an admin credit, debit or balance correction (the ledger holds the amounts)  |
| `settings_updated`                             | Réglages, opening hours, exceptions, token packs (old → new values)          |
| `payment_updated`                              | a cash payment marked received / not received at the desk                    |
| `role_changed`                                 | a member promoted to admin or back to player                                 |
| `court_updated`                                | a court created, edited, put in maintenance, archived, restored or deleted   |
| `pricing_updated`                              | a peak / off-peak pricing rule created, edited or deleted                    |
| `user_registered`                              | reserved for sign-ups                                                        |

Every entry names the admin who acted and, when a member is concerned, that member.

## Dates and times

One rule: **the database stores instants in UTC, the club's time zone is applied
when a time is read or shown.**

- Columns are `timestamp` (without time zone) holding UTC. The API writes them
  through Drizzle (always UTC) and pins every database session to UTC
  (`lib/db/src/index.ts`), so SQL `now()` defaults agree with it on any server.
- "What day / what time is it at the club" is computed in one place per side:
  `artifacts/api-server/src/lib/club-time.ts` (`CLUB_TIMEZONE`) and
  `artifacts/padel-club/src/lib/club-time.ts` (`VITE_CLUB_TIMEZONE`). Slots,
  opening hours, recurring series, reports and e-mails use them, so a player
  travelling abroad still sees club times, and daylight-saving changes are handled.
- Opening hours and pricing-rule hours are club wall-clock strings (`HH:MM`);
  holidays are club dates (`date`).
- In SQL, convert before grouping by day or hour:
  `(start_time at time zone 'UTC') at time zone '<club zone>'`.

## Rules the database guarantees

They hold even if the API had a bug, and are tested by
`supabase/tests/db-invariants.sql` (`pnpm --filter @workspace/scripts run db:test`).

| Rule                                               | Mechanism                                                       |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Two confirmed bookings never overlap on a court    | exclusion constraint `reservations_no_overlap` (btree_gist)     |
| A match never has more players than its spots      | trigger `reservation_players_capacity` (row lock + count)       |
| A player is in a match at most once                | unique (`reservation_id`, `user_id`)                            |
| A balance is never negative                        | `check (token_balance >= 0)`                                    |
| Every balance change has a ledger entry            | deferred constraint trigger `users_token_balance_ledger`        |
| The ledger is never edited or deleted              | trigger `token_transactions_append_only`                        |
| The same admin action never credits twice          | unique `token_transactions.idempotency_key`                     |
| One settings row, values in range                  | `club_settings` CHECK constraints (`id = 1`, ranges, min ≤ max) |
| Opening hours are coherent                         | CHECK `open_time < close_time` unless closed                    |
| One exception per day and court                    | unique index on (`date`, coalesce(`terrain_id`, 0))             |
| One pending personal invitation per member & match | partial unique index on `player_invites`                        |
| Every account gets a profile; e-mail stays in sync | triggers on `auth.users`                                        |
| Browsers can't read or write any table             | revokes + RLS without policies + default privileges             |

## Migrations

| File                                                        | What                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `20260527180000_drop_legacy_uuid_schema.sql`                | Removes an old empty prototype schema if present; refuses if it holds data. |
| `20260527190000_production_schema.sql`                      | Base schema.                                                                |
| `20260610000000_align_schema_with_drizzle.sql`              | Alignment with the Drizzle model.                                           |
| `20261001000000_pricing_equipment_series_notifications.sql` | Pricing rules, equipment, recurring bookings, notifications.                |
| `20261002000000_security_and_integrity.sql`                 | Lockdown, overlap constraint, capacity, ledger guards, payment states.      |
| `20261003000000_club_settings.sql`                          | Club settings, opening hours, exceptions, packs, court fields, invitations. |
| `20261004000000_user_gender.sql`                            | Player gender, copied from signup metadata by the auth trigger.             |
| `20261005000000_audit_trail_types.sql`                      | Audit-trail types (cash, roles, courts, pricing rules) and two indexes.     |
| `20261006000000_drop_unused_legacy_tables.sql`              | Drops the empty `clubs`, `staff_roles` and `terrains.capacity` (guarded).   |

All migrations are additive or guarded; none deletes club data. Apply them with
`pnpm --filter @workspace/scripts run db:migrate` (or `supabase db push`, or the
one-transaction `db:bundle` for the SQL editor). Writing a new one: add
`supabase/migrations/<timestamp>_<name>.sql`, update the Drizzle schema, run
`db:test` and the API tests, then apply to each club's project.

## Useful queries

```sql
select * from public.club_settings;                      -- current rules
select * from public.token_ledger_audit;                 -- must be empty
select sum(cash_amount) from public.token_transactions   -- cash taken for tokens this month
 where type = 'credit' and created_at >= date_trunc('month', now());
select message, user_name, created_at from public.activity
 where type = 'settings_updated' order by created_at desc limit 20;  -- who changed what
```
