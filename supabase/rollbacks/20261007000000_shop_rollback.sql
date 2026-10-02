-- Rollback for 20261007000000_shop.sql
-- Removes the boutique. Orders and the catalogue are deleted: export them first if
-- the club needs to keep them.
-- Note: the values added to notification_type cannot be dropped in Postgres; they
-- are harmless. Notifications already sent with them stay readable.
drop table if exists public.shop_order_items;
drop table if exists public.shop_orders;
drop table if exists public.shop_products;
drop type if exists public.shop_order_status;
alter table public.club_settings drop column if exists shop_enabled;

delete from public.activity where type in ('shop_updated', 'order_updated');
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated'
));
