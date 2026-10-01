-- ============================================================================
-- Peak / off-peak pricing, equipment rental, recurring bookings,
-- notification preferences, web push and an idempotent notification log.
-- Times in pricing rules are club-local wall-clock times ("HH:MM", Africa/Tunis).
-- ============================================================================

-- ─── Fix: let the API server manage token balances ──────────────────────────
-- protect_user_accounting_fields() must stop players from editing their own
-- balance through PostgREST (roles anon / authenticated). The Express API connects
-- directly with a privileged role and no Supabase JWT, so the previous version
-- rejected every booking debit and cancellation refund made by the API.
create or replace function public.protect_user_accounting_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side connections (API, migrations, dashboard SQL).
  -- PostgREST logs in as "authenticator" then SET ROLE anon/authenticated; this is
  -- SECURITY DEFINER, so current_user is the owner and can't be used here.
  if session_user <> 'authenticator'
     and coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.current_app_user_is_admin() then
    return new;
  end if;

  if new.role <> old.role or new.token_balance <> old.token_balance or new.supabase_auth_id <> old.supabase_auth_id then
    raise exception 'Only admins may update role, token balance, or auth identity';
  end if;

  return new;
end;
$$;

-- ─── Notification types ─────────────────────────────────────────────────────
alter type public.notification_type add value if not exists 'match_finished';
alter type public.notification_type add value if not exists 'welcome';

-- ─── User preferences ───────────────────────────────────────────────────────
alter table public.users add column if not exists email_notifications boolean not null default true;
alter table public.users add column if not exists push_notifications boolean not null default true;

-- ─── Pricing rules ──────────────────────────────────────────────────────────
-- A rule applies when the slot's local weekday is in days_of_week (0 = Sunday)
-- and its local start time is in [start_time, end_time). terrain_id NULL = all courts.
-- When several rules match, the highest priority wins (court-specific rules first).
create table if not exists public.pricing_rules (
  id serial primary key,
  name text not null,
  terrain_id integer references public.terrains(id) on delete cascade,
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  tokens_per_spot integer not null default 1 check (tokens_per_spot between 1 and 10),
  price_per_person real,
  is_peak boolean not null default false,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  check (start_time < end_time)
);
create index if not exists pricing_rules_active_idx on public.pricing_rules (is_active, terrain_id);

-- ─── Equipment rental ───────────────────────────────────────────────────────
create table if not exists public.equipment_items (
  id serial primary key,
  name text not null,
  description text,
  category text not null default 'racket',
  price real not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamp not null default now()
);

do $$ begin
  create type public.rental_status as enum ('reserved', 'handed_out', 'returned', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.reservation_equipment (
  id serial primary key,
  reservation_id integer not null references public.reservations(id) on delete cascade,
  item_id integer not null references public.equipment_items(id),
  user_id integer references public.users(id),
  quantity integer not null default 1 check (quantity between 1 and 8),
  unit_price real not null default 0,
  status public.rental_status not null default 'reserved',
  created_at timestamp not null default now()
);
create index if not exists reservation_equipment_reservation_idx on public.reservation_equipment (reservation_id);
create index if not exists reservation_equipment_item_idx on public.reservation_equipment (item_id, status);

-- ─── Recurring bookings ─────────────────────────────────────────────────────
do $$ begin
  create type public.series_status as enum ('active', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.reservation_series (
  id serial primary key,
  terrain_id integer not null references public.terrains(id),
  user_id integer references public.users(id),
  guest_name text,
  guest_phone text,
  label text,
  first_start timestamp not null,
  occurrences integer not null check (occurrences between 2 and 52),
  interval_weeks integer not null default 1 check (interval_weeks between 1 and 4),
  notes text,
  status public.series_status not null default 'active',
  created_by integer references public.users(id),
  created_at timestamp not null default now()
);
alter table public.reservations add column if not exists series_id integer references public.reservation_series(id) on delete set null;
create index if not exists reservations_series_idx on public.reservations (series_id);

-- ─── Web push ───────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ─── Notification log (idempotency for emails, push and scheduled jobs) ─────
create table if not exists public.notification_log (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  kind text not null,
  ref text not null default '',
  channels text[] not null default '{}',
  created_at timestamp not null default now(),
  unique (user_id, kind, ref)
);

-- ─── Row level security ─────────────────────────────────────────────────────
-- The API connects with a privileged role; these policies only govern direct
-- PostgREST access with the anon/authenticated keys.
alter table public.pricing_rules enable row level security;
alter table public.equipment_items enable row level security;
alter table public.reservation_equipment enable row level security;
alter table public.reservation_series enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "pricing public read" on public.pricing_rules;
create policy "pricing public read" on public.pricing_rules for select using (is_active or public.current_app_user_is_admin());
drop policy if exists "equipment public read" on public.equipment_items;
create policy "equipment public read" on public.equipment_items for select using (is_active or public.current_app_user_is_admin());
drop policy if exists "rentals admin read" on public.reservation_equipment;
create policy "rentals admin read" on public.reservation_equipment for select using (public.current_app_user_is_admin());
drop policy if exists "series admin read" on public.reservation_series;
create policy "series admin read" on public.reservation_series for select using (public.current_app_user_is_admin());
-- push_subscriptions and notification_log: no policies = no direct client access.
