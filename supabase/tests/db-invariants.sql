-- ============================================================================
-- Database invariant tests. Run on a disposable database that has
-- local-shim.sql + every migration applied (see scripts/src/test-db.ts).
-- Each block raises on failure; the run stops at the first failure.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- Fixtures ------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'alice@test.tn', '{"first_name":"Alice","last_name":"Ben Salah","phone":"+21620000000"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@test.tn', '{"full_name":"Bob Trabelsi"}'),
  ('00000000-0000-0000-0000-000000000003', 'admin@test.tn', '{}');
insert into public.terrains (name, type) values ('Court A', 'indoor'), ('Court B', 'outdoor');

do $$ begin
  -- 1. Signup creates the app user with names from metadata
  assert (select count(*) from public.users) = 3, 'auth trigger should create 3 users';
  assert (select first_name || '|' || last_name || '|' || phone from public.users where email = 'alice@test.tn')
         = 'Alice|Ben Salah|+21620000000', 'alice metadata not copied';
  assert (select first_name || '|' || last_name from public.users where email = 'bob@test.tn')
         = 'Bob|Trabelsi', 'full_name not split';
  raise notice 'ok 1 - signup creates profile';
end $$;

-- 2. Email change propagates
update auth.users set email = 'alice2@test.tn' where id = '00000000-0000-0000-0000-000000000001';
do $$ begin
  assert exists (select 1 from public.users where email = 'alice2@test.tn'), 'email change not synced';
  raise notice 'ok 2 - email change synced';
end $$;

-- 3. Overlapping bookings are impossible (exact and partial overlap)
insert into public.reservations (terrain_id, start_time, end_time, status)
values (1, '2030-01-01 18:30', '2030-01-01 20:00', 'confirmed');
do $$ begin
  begin
    insert into public.reservations (terrain_id, start_time, end_time) values (1, '2030-01-01 19:00', '2030-01-01 20:30');
    raise exception 'partial overlap was accepted';
  exception when exclusion_violation then null;
  end;
  begin
    insert into public.reservations (terrain_id, start_time, end_time) values (1, '2030-01-01 18:30', '2030-01-01 20:00');
    raise exception 'identical slot was accepted';
  exception when exclusion_violation or unique_violation then null;
  end;
  -- Back-to-back and other courts are fine; cancelled bookings free the slot
  insert into public.reservations (terrain_id, start_time, end_time) values (1, '2030-01-01 20:00', '2030-01-01 21:30');
  insert into public.reservations (terrain_id, start_time, end_time) values (2, '2030-01-01 18:30', '2030-01-01 20:00');
  update public.reservations set status = 'cancelled' where terrain_id = 2;
  insert into public.reservations (terrain_id, start_time, end_time) values (2, '2030-01-01 18:30', '2030-01-01 20:00');
  raise notice 'ok 3 - no overlapping confirmed bookings';
end $$;

-- 4. A match never exceeds its spots
do $$
declare
  rid int;
  i int;
begin
  insert into auth.users (email) select 'p' || g || '@test.tn' from generate_series(1, 5) g;
  insert into public.reservations (terrain_id, start_time, end_time, total_spots, booking_mode)
  values (1, '2030-02-01 10:00', '2030-02-01 11:30', 4, 'own_spot') returning id into rid;
  for i in 1..4 loop
    insert into public.reservation_players (reservation_id, user_id, payment_type, payment_status, tokens_charged)
    select rid, id, 'cash_club', 'pending', 0 from public.users where email = 'p' || i || '@test.tn';
  end loop;
  begin
    insert into public.reservation_players (reservation_id, user_id) select rid, id from public.users where email = 'p5@test.tn';
    raise exception 'fifth player was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Reservation % is full' then raise; end if;
  end;
  -- New payment states exist
  insert into public.reservations (terrain_id, start_time, end_time) values (2, '2030-02-01 10:00', '2030-02-01 11:30') returning id into rid;
  insert into public.reservation_players (reservation_id, user_id, payment_type, tokens_charged)
  select rid, id, 'invited_free', 0 from public.users where email = 'p5@test.tn';
  raise notice 'ok 4 - capacity enforced, payment states token/cash_club/invited_free';
end $$;

-- 5. Token ledger: balance changes need a ledger entry; ledger is append-only
do $$ begin
  begin
    -- direct edit, no transaction row
    update public.users set token_balance = 50 where email = 'bob@test.tn';
    set constraints users_token_balance_ledger immediate;
    raise exception 'balance changed without ledger entry was accepted';
  exception when raise_exception then
    if sqlerrm not like '%without a ledger entry%' then raise; end if;
  end;
  raise notice 'ok 5a - unrecorded balance change refused';
end $$;

begin;
update public.users set token_balance = 8 where email = 'bob@test.tn';
insert into public.token_transactions (user_id, type, amount, balance_after, description)
select id, 'credit', 8, 8, 'Cash payment at the club' from public.users where email = 'bob@test.tn';
commit;

do $$ begin
  assert (select token_balance from public.users where email = 'bob@test.tn') = 8, 'recorded credit lost';
  begin
    update public.token_transactions set amount = 800;
    raise exception 'ledger edit accepted';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.token_transactions;
    raise exception 'ledger delete accepted';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    update public.users set token_balance = -1 where email = 'bob@test.tn';
    raise exception 'negative balance accepted';
  exception when check_violation then null;
  end;
  assert not exists (select 1 from public.token_ledger_audit), 'ledger audit should be empty';
  raise notice 'ok 5b - ledger append-only, no negative balance, audit clean';
end $$;

-- 6. Browser roles (anon / authenticated) have no direct access to club data
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), 'anon can read ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'SELECT'), 'authenticated can read ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT'), 'authenticated can insert ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'UPDATE'), 'authenticated can update ' || t;
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), 'RLS off on ' || t;
  end loop;
  assert not exists (select 1 from pg_policies where schemaname = 'public'), 'permissive public policies remain';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
    'public tables still published to realtime';
  assert not has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE'), 'anon can run signup trigger fn';
  raise notice 'ok 6 - no direct browser access to public schema';
end $$;

-- 7. Same check through a real role switch (what PostgREST does)
set role authenticated;
do $$ begin
  begin
    perform 1 from public.users limit 1;
    raise exception 'authenticated read users';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reservations (terrain_id, start_time, end_time) values (1, '2031-01-01 10:00', '2031-01-01 11:30');
    raise exception 'authenticated inserted a reservation';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok 7 - authenticated role is denied';
end $$;
reset role;

-- 8. Tables created later are private by default
create table public.zz_future_table (id int);
do $$ begin
  assert not has_table_privilege('anon', 'public.zz_future_table', 'SELECT'), 'new tables are exposed to anon';
  raise notice 'ok 8 - future tables private by default';
end $$;
drop table public.zz_future_table;

-- 9. Legacy prototype schema is gone
do $$ begin
  assert to_regclass('public.profiles') is null and to_regclass('public.reservation_payments') is null
     and to_regclass('public.courts') is null, 'legacy tables remain';
  assert not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'), 'legacy auth trigger remains';
  raise notice 'ok 9 - legacy schema removed';
end $$;

-- 10. Club settings: one row with sane defaults, bad values refused
do $$ begin
  assert (select count(*) from public.club_settings) = 1, 'club_settings must have exactly one row';
  assert (select booking_duration_minutes || '|' || max_players || '|' || player_price || '|' || token_cost_full_court
          from public.club_settings) = '90|4|25.00|4', 'unexpected default settings';
  assert (select count(*) from public.opening_hours) = 7, 'opening hours not seeded';
  assert (select count(*) from public.token_packages) = 3, 'token packages not seeded';
  begin
    insert into public.club_settings (id) values (2);
    raise exception 'second settings row accepted';
  exception when check_violation then null;
  end;
  begin
    update public.club_settings set booking_duration_minutes = 7;
    raise exception 'invalid duration accepted';
  exception when check_violation then null;
  end;
  begin
    update public.club_settings set min_players = 4, max_players = 2;
    raise exception 'min_players > max_players accepted';
  exception when check_violation then null;
  end;
  begin
    update public.opening_hours set open_time = '23:00', close_time = '08:00' where weekday = 1;
    raise exception 'inverted opening hours accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.schedule_exceptions (date, is_closed) values ('2030-12-25', true), ('2030-12-25', true);
    raise exception 'duplicate club-wide exception accepted';
  exception when unique_violation then null;
  end;
  assert (select price_per_person is null and opening_time is null from public.terrains where name = 'Court A'),
    'courts should inherit club settings by default';
  raise notice 'ok 10 - club settings single row, validated, courts inherit';
end $$;

-- 11. Audit trail: staff actions have their own types; unknown types are refused
do $$ begin
  insert into public.activity (type, message) values
    ('payment_updated', 'x'), ('role_changed', 'x'), ('court_updated', 'x'), ('pricing_updated', 'x');
  begin
    insert into public.activity (type, message) values ('anything_else', 'x');
    raise exception 'unknown activity type accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok 11 - audit trail types';
end $$;
