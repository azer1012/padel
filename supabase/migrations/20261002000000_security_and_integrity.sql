-- ============================================================================
-- Security & data-integrity hardening for production.
--
-- Access model: the browser talks to Supabase for AUTH ONLY. Every read/write of
-- club data goes through the Express API, which connects with DATABASE_URL (a
-- privileged role that bypasses RLS) and enforces business rules server-side.
-- Therefore the anon / authenticated roles get NO direct access to public tables.
-- ============================================================================

-- ─── 1. Per-player payment states ───────────────────────────────────────────
-- payment_type is HOW the spot is paid:  token | cash_club | invited_free
-- payment_status is WHERE it stands:     paid | pending | refunded
do $$ begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'player_payment_type' and e.enumlabel = 'cash'
  ) then
    alter type public.player_payment_type rename value 'cash' to 'cash_club';
  end if;
end $$;
alter type public.player_payment_type add value if not exists 'invited_free';

-- ─── 2. Two bookings can never overlap on the same court ────────────────────
-- The old unique index only caught identical start times (18:30 vs 18:30), not
-- overlapping ones (18:30 vs 19:00). An exclusion constraint makes the database
-- reject any overlap, whatever the application does (error 23P01).
create extension if not exists btree_gist with schema extensions;

alter table public.reservations drop constraint if exists reservations_no_overlap;
alter table public.reservations add constraint reservations_no_overlap
  exclude using gist (
    terrain_id extensions.gist_int4_ops with =,
    tsrange(start_time, end_time, '[)') with &&
  ) where (status = 'confirmed');

-- ─── 3. A match never has more players than spots ───────────────────────────
create or replace function public.enforce_reservation_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap integer;
  taken integer;
begin
  -- Row lock serializes concurrent joins on the same reservation
  select total_spots into cap from public.reservations where id = new.reservation_id for update;
  select count(*) into taken from public.reservation_players where reservation_id = new.reservation_id;
  if taken >= cap then
    raise exception 'Reservation % is full', new.reservation_id
      using errcode = 'P0001', hint = 'RESERVATION_FULL';
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_players_capacity on public.reservation_players;
create trigger reservation_players_capacity
before insert on public.reservation_players
for each row execute function public.enforce_reservation_capacity();

-- ─── 4. Token ledger ────────────────────────────────────────────────────────
-- 4a. The ledger is append-only: no edits, no deletions.
create or replace function public.token_transactions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'token_transactions is append-only (% refused)', tg_op using errcode = 'P0001';
end;
$$;

drop trigger if exists token_transactions_append_only on public.token_transactions;
create trigger token_transactions_append_only
before update or delete on public.token_transactions
for each row execute function public.token_transactions_append_only();

-- 4b. Every balance change must be recorded: at COMMIT, the user's latest ledger
-- entry must carry the user's final balance. A balance edited without a matching
-- transaction aborts the whole transaction.
create or replace function public.assert_token_balance_recorded()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_balance integer;
  last_after integer;
begin
  select token_balance into current_balance from public.users where id = new.id;
  select balance_after into last_after
    from public.token_transactions where user_id = new.id
    order by id desc limit 1;
  if last_after is distinct from current_balance then
    raise exception 'Token balance of user % changed without a ledger entry', new.id
      using errcode = 'P0001', hint = 'TOKEN_LEDGER_MISMATCH';
  end if;
  return null;
end;
$$;

drop trigger if exists users_token_balance_ledger on public.users;
create constraint trigger users_token_balance_ledger
after update of token_balance on public.users
deferrable initially deferred
for each row
when (old.token_balance is distinct from new.token_balance)
execute function public.assert_token_balance_recorded();

-- 4c. Idempotency: the same admin action (double click, network retry) can't credit twice.
alter table public.token_transactions add column if not exists idempotency_key text;
create unique index if not exists token_transactions_idempotency_key_idx
  on public.token_transactions (idempotency_key) where idempotency_key is not null;

-- 4d. Audit view: users whose balance doesn't match their last ledger entry (should be empty).
create or replace view public.token_ledger_audit
with (security_invoker = true) as
select u.id as user_id, u.email, u.token_balance,
       (select t.balance_after from public.token_transactions t
         where t.user_id = u.id order by t.id desc limit 1) as last_balance_after
from public.users u
where u.token_balance <> coalesce(
  (select t.balance_after from public.token_transactions t
    where t.user_id = u.id order by t.id desc limit 1), 0);

-- ─── 5. Player profile is created by the database at signup ─────────────────
-- (The API's POST /users/sync stays as an idempotent fallback.)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := nullif(trim(coalesce(meta->>'full_name', meta->>'name', '')), '');
begin
  -- Same email re-registered after its previous auth account was deleted: relink.
  update public.users u
     set supabase_auth_id = new.id::text, updated_at = now()
   where new.email is not null
     and lower(u.email) = lower(new.email)
     and not exists (select 1 from auth.users a where a.id::text = u.supabase_auth_id);
  if found then
    return new;
  end if;

  insert into public.users (supabase_auth_id, email, first_name, last_name, phone, avatar_url)
  values (
    new.id::text,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    left(nullif(trim(coalesce(meta->>'first_name', split_part(full_name, ' ', 1), '')), ''), 80),
    left(nullif(trim(coalesce(meta->>'last_name',
      nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), ''), '')), ''), 80),
    left(nullif(trim(coalesce(meta->>'phone', '')), ''), 30),
    nullif(meta->>'avatar_url', '')
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app on auth.users;
create trigger on_auth_user_created_app
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email, updated_at = now()
   where supabase_auth_id = new.id::text and new.email is not null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed_app on auth.users;
create trigger on_auth_user_email_changed_app
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_auth_email_change();

-- ─── 6. Lock down direct (PostgREST / Realtime) access ──────────────────────
-- Drop every permissive policy: several allowed players to insert reservations or
-- add themselves to a match as "paid" without paying, straight from the browser.
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- Tables, sequences and functions created later by the postgres role are private too.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

-- The app doesn't use Realtime (it polls the API), so publish nothing from public.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
  end loop;
end $$;

-- open_matches view: run with the caller's rights (it ran as owner and bypassed RLS).
drop view if exists public.open_matches;
create view public.open_matches with (security_invoker = true) as
select r.*
from public.reservations r
where r.is_public = true and r.status = 'confirmed' and r.start_time >= now();
revoke all on public.open_matches, public.token_ledger_audit from anon, authenticated;

-- Storage: the app never uploads from the browser. Public buckets keep serving files
-- by public URL; listing and browser-side writes are closed.
drop policy if exists "public image read" on storage.objects;
drop policy if exists "own avatar upload" on storage.objects;
drop policy if exists "own avatar update" on storage.objects;
drop policy if exists "admin media upload" on storage.objects;
drop policy if exists "admin media update" on storage.objects;
drop policy if exists "admin media delete" on storage.objects;

-- ─── 7. Indexes for foreign keys and hot queries ────────────────────────────
create index if not exists reservations_status_start_idx on public.reservations (status, start_time);
create index if not exists reservations_terrain_idx on public.reservations (terrain_id);
create index if not exists token_transactions_reservation_idx on public.token_transactions (reservation_id);
create index if not exists token_transactions_admin_idx on public.token_transactions (admin_id);
create index if not exists player_invites_reservation_idx on public.player_invites (reservation_id);
create index if not exists player_invites_invited_by_idx on public.player_invites (invited_by_user_id);
create index if not exists tournament_registrations_user_idx on public.tournament_registrations (user_id);
create index if not exists reservation_series_terrain_idx on public.reservation_series (terrain_id);
create index if not exists reservation_series_user_idx on public.reservation_series (user_id);
create index if not exists reservation_series_created_by_idx on public.reservation_series (created_by);
create index if not exists reservation_equipment_user_idx on public.reservation_equipment (user_id);
create index if not exists pricing_rules_terrain_idx on public.pricing_rules (terrain_id);
