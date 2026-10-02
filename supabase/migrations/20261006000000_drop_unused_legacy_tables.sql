-- ============================================================================
-- Removes what the product never uses:
--   public.clubs         left over from the prototype. One installation is one club:
--                        its identity is design-time branding, its rules are in
--                        club_settings. There is no table of clubs.
--   public.staff_roles   never read or written; staff are users with role 'admin'.
--   terrains.capacity    players per match come from club_settings.max_players
--                        (stored on each booking as reservations.total_spots).
--
-- Guarded: stops without changing anything if either table holds a row.
-- Rollback: supabase/rollbacks/20261006000000_drop_unused_legacy_tables_rollback.sql
-- ============================================================================
do $$
declare
  n bigint;
begin
  if to_regclass('public.clubs') is not null then
    execute 'select count(*) from public.clubs' into n;
    if n > 0 then
      raise exception 'public.clubs holds % row(s): review them before dropping the table', n;
    end if;
  end if;
  if to_regclass('public.staff_roles') is not null then
    execute 'select count(*) from public.staff_roles' into n;
    if n > 0 then
      raise exception 'public.staff_roles holds % row(s): review them before dropping the table', n;
    end if;
  end if;
end $$;

drop table if exists public.staff_roles;
drop type if exists public.staff_role_type;
drop table if exists public.clubs;
alter table public.terrains drop column if exists capacity;
