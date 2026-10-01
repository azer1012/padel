-- ============================================================================
-- One-off cleanup of a legacy prototype schema (UUID "profiles / courts /
-- reservation_payments") that was applied to the hosted project outside of this
-- repository on 2026-06-29. The application has never used it.
--
-- Safe by construction:
--   * On a fresh database nothing matches and this is a no-op.
--   * It only acts when the legacy marker (reservations.court_id) exists, so it can
--     never touch the application's own reservations table (which has terrain_id).
--   * It refuses to run if any legacy table holds data.
-- ============================================================================
do $$
declare
  legacy_rows bigint := 0;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservations' and column_name = 'court_id'
  ) then
    return;
  end if;

  select
    (select count(*) from public.profiles) +
    (select count(*) from public.courts) +
    (select count(*) from public.reservations) +
    (select count(*) from public.reservation_players) +
    (select count(*) from public.reservation_payments) +
    (select count(*) from public.token_transactions) +
    (select count(*) from public.clubs)
  into legacy_rows;

  if legacy_rows > 0 then
    raise exception 'Legacy schema contains % rows; migrate or back them up before dropping', legacy_rows;
  end if;

  drop trigger if exists on_auth_user_created on auth.users;

  drop table if exists public.reservation_payments cascade;
  drop table if exists public.reservation_players cascade;
  drop table if exists public.reservations cascade;
  drop table if exists public.token_transactions cascade;
  drop table if exists public.courts cascade;
  drop table if exists public.clubs cascade;
  drop table if exists public.profiles cascade;

  drop function if exists public.handle_new_user() cascade;
  drop function if exists public.update_profile_token_balance() cascade;
  drop function if exists public.is_admin() cascade;

  drop type if exists public.payment_status;
  drop type if exists public.token_transaction_type;
  drop type if exists public.user_role;
  drop type if exists public.reservation_status;
end $$;
