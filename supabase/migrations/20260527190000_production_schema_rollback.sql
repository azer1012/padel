drop view if exists public.open_matches;
drop function if exists public.protect_user_accounting_fields();
drop function if exists public.current_app_user_is_admin();
drop function if exists public.current_app_user_id();

drop table if exists public.staff_roles cascade;
drop table if exists public.activity cascade;
drop table if exists public.news cascade;
drop table if exists public.tournament_registrations cascade;
drop table if exists public.tournaments cascade;
drop table if exists public.notifications cascade;
drop table if exists public.token_transactions cascade;
drop table if exists public.player_invites cascade;
drop table if exists public.reservation_players cascade;
drop table if exists public.reservations cascade;
drop table if exists public.terrains cascade;
drop table if exists public.clubs cascade;
drop table if exists public.users cascade;

delete from storage.objects where bucket_id in ('avatars', 'clubs', 'courts', 'tournaments', 'gallery');
delete from storage.buckets where id in ('avatars', 'clubs', 'courts', 'tournaments', 'gallery');

drop type if exists public.tournament_status;
drop type if exists public.notification_type;
drop type if exists public.token_type;
drop type if exists public.invite_status;
drop type if exists public.player_payment_status;
drop type if exists public.player_payment_type;
drop type if exists public.booking_mode;
drop type if exists public.booking_type;
drop type if exists public.reservation_status;
drop type if exists public.terrain_type;
drop type if exists public.language;
drop type if exists public.role;
