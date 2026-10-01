-- ============================================================================
-- Operational settings for ONE club installation (no tenant / club id: each club
-- has its own database). Everything an owner may change while running the club
-- lives here and is edited from Admin → Réglages. Branding (name, logo, colours,
-- photos) is NOT here: it's design-time configuration of each installation.
--
-- Additive migration: new tables, new nullable columns, relaxed NOT NULLs. The
-- only data touched: court hours/prices equal to the old hard-coded defaults are
-- turned into "use club setting" (NULL), which yields exactly the same behaviour.
-- ============================================================================

-- ─── 1. Club settings: a single row (id = 1) ────────────────────────────────
create table if not exists public.club_settings (
  id smallint primary key default 1 check (id = 1),

  -- Booking
  booking_duration_minutes integer not null default 90
    check (booking_duration_minutes between 30 and 240 and booking_duration_minutes % 5 = 0),
  min_players integer not null default 1 check (min_players between 1 and 8),
  max_players integer not null default 4 check (max_players between 1 and 8),
  min_advance_minutes integer not null default 30 check (min_advance_minutes between 0 and 10080),
  max_advance_days integer not null default 14 check (max_advance_days between 1 and 365),

  -- Cancellation: players cancel (or leave) with a full token refund until
  -- cancellation_notice_hours before the match. After that: 'forbid' or 'no_refund'.
  cancellation_notice_hours integer not null default 0 check (cancellation_notice_hours between 0 and 168),
  late_cancellation text not null default 'forbid' check (late_cancellation in ('forbid', 'no_refund')),

  -- Pricing (cash prices at the desk, in `currency`)
  currency text not null default 'TND' check (currency ~ '^[A-Z]{3}$'),
  player_price numeric(10, 2) not null default 25 check (player_price >= 0),
  full_court_price numeric(10, 2) not null default 100 check (full_court_price >= 0),

  -- Tokens
  token_cost_player integer not null default 1 check (token_cost_player between 0 and 100),
  token_cost_full_court integer not null default 4 check (token_cost_full_court between 0 and 400),
  token_unit_price numeric(10, 2) not null default 25 check (token_unit_price >= 0),
  token_min_purchase integer not null default 1 check (token_min_purchase between 1 and 1000),

  -- Features
  open_matches_enabled boolean not null default true,
  invitations_enabled boolean not null default true,
  cash_payment_enabled boolean not null default true,

  -- Notifications (in-app + email + push, each member still picks channels in their profile)
  booking_confirmation_notifications_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  reminder_lead_minutes integer not null default 120 check (reminder_lead_minutes between 15 and 1440),
  cancellation_notifications_enabled boolean not null default true,
  invitation_notifications_enabled boolean not null default true,
  token_notifications_enabled boolean not null default true,
  match_finished_notifications_enabled boolean not null default true,

  updated_at timestamp not null default now(),
  updated_by integer references public.users(id) on delete set null,

  constraint club_settings_players check (min_players <= max_players)
);
insert into public.club_settings (id) values (1) on conflict (id) do nothing;

-- ─── 2. Weekly opening hours (0 = Sunday … 6 = Saturday) ────────────────────
create table if not exists public.opening_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  is_closed boolean not null default false,
  open_time text not null default '08:00' check (open_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  close_time text not null default '23:00' check (close_time ~ '^([01]\d|2[0-3]):[0-5]\d$|^24:00$'),
  constraint opening_hours_order check (is_closed or open_time < close_time)
);
insert into public.opening_hours (weekday)
select g from generate_series(0, 6) g
on conflict (weekday) do nothing;

-- ─── 3. Exceptions: holidays, exceptional hours, maintenance days ──────────
-- terrain_id NULL = whole club. is_closed = nothing bookable that day; otherwise
-- open_time/close_time replace the normal hours for that date.
create table if not exists public.schedule_exceptions (
  id serial primary key,
  date date not null,
  terrain_id integer references public.terrains(id) on delete cascade,
  is_closed boolean not null default true,
  open_time text check (open_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  close_time text check (close_time ~ '^([01]\d|2[0-3]):[0-5]\d$|^24:00$'),
  reason text,
  created_at timestamp not null default now(),
  constraint schedule_exceptions_hours check (
    is_closed or (open_time is not null and close_time is not null and open_time < close_time)
  )
);
create unique index if not exists schedule_exceptions_day_court_idx
  on public.schedule_exceptions (date, coalesce(terrain_id, 0));
create index if not exists schedule_exceptions_terrain_idx on public.schedule_exceptions (terrain_id);

-- ─── 4. Token packages sold at the desk (10 tokens = 250 TND …) ────────────
create table if not exists public.token_packages (
  id serial primary key,
  name text not null,
  tokens integer not null check (tokens between 1 and 1000),
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp not null default now()
);
insert into public.token_packages (name, tokens, price, sort_order)
select * from (values ('Pack 10', 10, 250.00, 1), ('Pack 20', 20, 480.00, 2), ('Pack 50', 50, 1150.00, 3)) v
where not exists (select 1 from public.token_packages);

-- Cash received for a credit (accounting), and which package was sold
alter table public.token_transactions add column if not exists cash_amount numeric(10, 2) check (cash_amount >= 0);
alter table public.token_transactions add column if not exists package_id integer references public.token_packages(id) on delete set null;
create index if not exists token_transactions_package_idx on public.token_transactions (package_id);

-- ─── 5. Courts: number, order, maintenance, archive, optional overrides ────
alter table public.terrains add column if not exists number integer;
alter table public.terrains add column if not exists sort_order integer not null default 0;
alter table public.terrains add column if not exists is_maintenance boolean not null default false;
alter table public.terrains add column if not exists maintenance_note text;
alter table public.terrains add column if not exists archived_at timestamp;

-- Price and hours become optional per-court overrides of the club settings
alter table public.terrains alter column price_per_person drop not null;
alter table public.terrains alter column price_per_person drop default;
alter table public.terrains alter column opening_time drop not null;
alter table public.terrains alter column opening_time drop default;
alter table public.terrains alter column closing_time drop not null;
alter table public.terrains alter column closing_time drop default;
update public.terrains set price_per_person = null where price_per_person = 25;
update public.terrains set opening_time = null, closing_time = null
 where opening_time = '08:00' and closing_time = '23:00';
update public.terrains set sort_order = id where sort_order = 0;

-- ─── 6. Invitations: invite a member in-app, who can accept or decline ─────
alter type public.invite_status add value if not exists 'declined';
alter type public.notification_type add value if not exists 'invitation';
alter table public.player_invites add column if not exists invited_user_id integer references public.users(id) on delete cascade;
alter table public.player_invites add column if not exists responded_at timestamp;
create index if not exists player_invites_invited_user_idx on public.player_invites (invited_user_id, status);
-- One open personal invitation per member and match
create unique index if not exists player_invites_personal_pending_idx
  on public.player_invites (reservation_id, invited_user_id)
  where invited_user_id is not null and status = 'pending';

-- ─── 7. Activity log: settings changes are audited too ──────────────────────
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated'
));

-- ─── 8. Same lockdown as every other table: API-only access ────────────────
alter table public.club_settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.token_packages enable row level security;
revoke all on public.club_settings, public.opening_hours, public.schedule_exceptions, public.token_packages
  from anon, authenticated;
revoke all on sequence public.schedule_exceptions_id_seq, public.token_packages_id_seq from anon, authenticated;
