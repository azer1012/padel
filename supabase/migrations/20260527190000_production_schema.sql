create extension if not exists pgcrypto;

do $$ begin
  create type public.role as enum ('admin', 'player');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.language as enum ('fr', 'ar', 'en');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.terrain_type as enum ('indoor', 'outdoor');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.reservation_status as enum ('confirmed', 'cancelled', 'pending');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_type as enum ('online', 'phone', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_mode as enum ('full_court', 'own_spot');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.player_payment_type as enum ('token', 'cash');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.player_payment_status as enum ('paid', 'pending', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.token_type as enum ('credit', 'debit', 'adjustment');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.notification_type as enum ('booking_confirmed', 'booking_cancelled', 'tokens_added', 'reservation_reminder', 'announcement');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.tournament_status as enum ('upcoming', 'open', 'ongoing', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.users (
  id serial primary key,
  supabase_auth_id text not null unique,
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  role public.role not null default 'player',
  avatar_url text,
  token_balance integer not null default 0 check (token_balance >= 0),
  language public.language not null default 'fr',
  created_at timestamp not null default now(),
  updated_at timestamp
);

create table if not exists public.clubs (
  id serial primary key,
  name text not null,
  description text,
  address text,
  phone text,
  email text,
  logo_url text,
  cover_url text,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp
);

create table if not exists public.terrains (
  id serial primary key,
  name text not null,
  description text,
  type public.terrain_type not null,
  is_active boolean not null default true,
  price_per_person real not null default 25 check (price_per_person >= 0),
  capacity integer not null default 4 check (capacity > 0),
  opening_time text not null default '08:00',
  closing_time text not null default '23:00',
  photos text[] not null default '{}',
  created_at timestamp not null default now()
);

create table if not exists public.reservations (
  id serial primary key,
  terrain_id integer not null references public.terrains(id),
  user_id integer references public.users(id),
  guest_name text,
  guest_phone text,
  start_time timestamp not null,
  end_time timestamp not null,
  status public.reservation_status not null default 'confirmed',
  tokens_charged integer not null default 1 check (tokens_charged >= 0),
  booking_type public.booking_type not null default 'online',
  booking_mode public.booking_mode not null default 'full_court',
  total_spots integer not null default 4 check (total_spots > 0),
  is_public boolean not null default false,
  public_description text,
  notes text,
  created_at timestamp not null default now(),
  constraint reservations_valid_time check (end_time > start_time)
);

create table if not exists public.reservation_players (
  id serial primary key,
  reservation_id integer not null references public.reservations(id) on delete cascade,
  user_id integer not null references public.users(id),
  payment_type public.player_payment_type not null default 'token',
  payment_status public.player_payment_status not null default 'paid',
  tokens_charged integer not null default 1 check (tokens_charged >= 0),
  notes text,
  joined_at timestamp not null default now(),
  unique (reservation_id, user_id)
);

create table if not exists public.player_invites (
  id serial primary key,
  invite_token text not null unique,
  reservation_id integer not null references public.reservations(id) on delete cascade,
  invited_by_user_id integer not null references public.users(id),
  invited_email text,
  expires_at timestamp not null,
  status public.invite_status not null default 'pending',
  created_at timestamp not null default now()
);

create table if not exists public.token_transactions (
  id serial primary key,
  user_id integer not null references public.users(id),
  admin_id integer references public.users(id),
  reservation_id integer references public.reservations(id),
  type public.token_type not null,
  amount integer not null check (amount >= 0),
  balance_after integer not null check (balance_after >= 0),
  description text not null,
  notes text,
  expires_at timestamp,
  created_at timestamp not null default now()
);

create table if not exists public.notifications (
  id serial primary key,
  user_id integer not null references public.users(id),
  type public.notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamp not null default now()
);

create table if not exists public.tournaments (
  id serial primary key,
  name text not null,
  description text,
  status public.tournament_status not null default 'upcoming',
  start_date timestamp not null,
  end_date timestamp,
  max_teams integer check (max_teams is null or max_teams > 0),
  registered_teams integer not null default 0 check (registered_teams >= 0),
  prize_info text,
  image_url text,
  created_at timestamp not null default now()
);

create table if not exists public.tournament_registrations (
  id serial primary key,
  tournament_id integer not null references public.tournaments(id),
  user_id integer not null references public.users(id),
  team_name text,
  created_at timestamp not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.news (
  id serial primary key,
  title text not null,
  content text not null,
  excerpt text,
  image_url text,
  published boolean not null default false,
  created_at timestamp not null default now(),
  updated_at timestamp
);

create table if not exists public.activity (
  id serial primary key,
  type text not null,
  message text not null,
  user_id integer,
  user_name text,
  created_at timestamp not null default now()
);

create table if not exists public.staff_roles (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  role text not null,
  created_at timestamp not null default now(),
  unique (user_id, role)
);

create unique index if not exists reservations_terrain_start_confirmed_idx
  on public.reservations (terrain_id, start_time)
  where status = 'confirmed';
create index if not exists reservations_user_start_idx on public.reservations (user_id, start_time desc);
create index if not exists reservations_public_start_idx on public.reservations (is_public, start_time) where is_public = true;
create index if not exists reservation_players_user_idx on public.reservation_players (user_id);
create index if not exists token_transactions_user_created_idx on public.token_transactions (user_id, created_at desc);
create index if not exists notifications_user_read_created_idx on public.notifications (user_id, is_read, created_at desc);
create index if not exists tournaments_status_start_idx on public.tournaments (status, start_date);

create or replace view public.open_matches as
select r.*
from public.reservations r
where r.is_public = true and r.status = 'confirmed' and r.start_time >= now();

create or replace function public.current_app_user_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where supabase_auth_id = auth.uid()::text
$$;

create or replace function public.current_app_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where supabase_auth_id = auth.uid()::text and role = 'admin'
  )
$$;

create or replace function public.protect_user_accounting_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_user_is_admin() then
    return new;
  end if;

  if new.role <> old.role or new.token_balance <> old.token_balance or new.supabase_auth_id <> old.supabase_auth_id then
    raise exception 'Only admins may update role, token balance, or auth identity';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_accounting_fields on public.users;
create trigger protect_user_accounting_fields
before update on public.users
for each row execute function public.protect_user_accounting_fields();

alter table public.users enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_players enable row level security;
alter table public.player_invites enable row level security;
alter table public.token_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.terrains enable row level security;
alter table public.clubs enable row level security;
alter table public.news enable row level security;

create policy "users select own or admin" on public.users for select using (supabase_auth_id = auth.uid()::text or public.current_app_user_is_admin());
create policy "users update own profile" on public.users for update using (supabase_auth_id = auth.uid()::text) with check (supabase_auth_id = auth.uid()::text);
create policy "users admin all" on public.users for all using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());

create policy "reservations visible to owner players public or admin" on public.reservations for select using (
  public.current_app_user_is_admin()
  or user_id = public.current_app_user_id()
  or is_public = true
  or exists (
    select 1 from public.reservation_players rp
    where rp.reservation_id = reservations.id and rp.user_id = public.current_app_user_id()
  )
);
create policy "reservations insert own" on public.reservations for insert with check (user_id = public.current_app_user_id());
create policy "reservations update owner or admin" on public.reservations for update using (public.current_app_user_is_admin() or user_id = public.current_app_user_id());

create policy "reservation players visible to participants or admin" on public.reservation_players for select using (
  public.current_app_user_is_admin()
  or user_id = public.current_app_user_id()
  or exists (
    select 1 from public.reservations r
    where r.id = reservation_players.reservation_id and r.user_id = public.current_app_user_id()
  )
);
create policy "reservation players insert self" on public.reservation_players for insert with check (user_id = public.current_app_user_id() or public.current_app_user_is_admin());
create policy "reservation players update admin only" on public.reservation_players for update using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());

create policy "invites visible to creator reservation owner or admin" on public.player_invites for select using (
  public.current_app_user_is_admin()
  or invited_by_user_id = public.current_app_user_id()
  or exists (
    select 1 from public.reservations r
    where r.id = player_invites.reservation_id and r.user_id = public.current_app_user_id()
  )
);
create policy "invites create by authenticated users" on public.player_invites for insert with check (invited_by_user_id = public.current_app_user_id());
create policy "invites update by creator or admin" on public.player_invites for update using (public.current_app_user_is_admin() or invited_by_user_id = public.current_app_user_id());

create policy "token transactions select own or admin" on public.token_transactions for select using (public.current_app_user_is_admin() or user_id = public.current_app_user_id());
create policy "token transactions admin insert only" on public.token_transactions for insert with check (public.current_app_user_is_admin());
create policy "token transactions immutable except admin" on public.token_transactions for update using (false);

create policy "notifications select own or admin" on public.notifications for select using (public.current_app_user_is_admin() or user_id = public.current_app_user_id());
create policy "notifications update own read state" on public.notifications for update using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());
create policy "notifications admin insert" on public.notifications for insert with check (public.current_app_user_is_admin());

create policy "tournaments public read" on public.tournaments for select using (true);
create policy "tournaments admin write" on public.tournaments for all using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());
create policy "tournament registrations own or admin read" on public.tournament_registrations for select using (public.current_app_user_is_admin() or user_id = public.current_app_user_id());
create policy "tournament registrations insert own" on public.tournament_registrations for insert with check (user_id = public.current_app_user_id());

create policy "terrains public read" on public.terrains for select using (true);
create policy "terrains admin write" on public.terrains for all using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());
create policy "clubs public read" on public.clubs for select using (true);
create policy "clubs admin write" on public.clubs for all using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());
create policy "news public published read" on public.news for select using (published = true or public.current_app_user_is_admin());
create policy "news admin write" on public.news for all using (public.current_app_user_is_admin()) with check (public.current_app_user_is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('clubs', 'clubs', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('courts', 'courts', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('tournaments', 'tournaments', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('gallery', 'gallery', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public image read" on storage.objects for select using (bucket_id in ('avatars', 'clubs', 'courts', 'tournaments', 'gallery'));
create policy "own avatar upload" on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own avatar update" on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "admin media upload" on storage.objects for insert with check (bucket_id in ('clubs', 'courts', 'tournaments', 'gallery') and public.current_app_user_is_admin());
create policy "admin media update" on storage.objects for update using (bucket_id in ('clubs', 'courts', 'tournaments', 'gallery') and public.current_app_user_is_admin());
create policy "admin media delete" on storage.objects for delete using (bucket_id in ('clubs', 'courts', 'tournaments', 'gallery') and public.current_app_user_is_admin());

alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.reservation_players;
alter publication supabase_realtime add table public.player_invites;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.token_transactions;
alter publication supabase_realtime add table public.users;
