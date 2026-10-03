-- Rollback for 20261011000000_online_payments.sql
-- Loses the record of every online payment (the tokens already credited stay in the
-- ledger). Only run it on an installation that never took an online payment, or after
-- exporting public.payments.
update public.activity set type = 'payment_updated' where type = 'payment_received';
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated',
  'shop_updated', 'order_updated',
  'member_updated', 'tournament_updated'
));

drop table if exists public.payments;
drop type if exists public.payment_status;
alter table public.shop_orders drop column if exists paid_online_at;
alter table public.club_settings drop column if exists online_payment_enabled;
