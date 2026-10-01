-- Rollback for 20261001000000_pricing_equipment_series_notifications.sql
-- Note: enum values added to notification_type cannot be dropped in Postgres; they are harmless.
drop table if exists public.notification_log;
drop table if exists public.push_subscriptions;
alter table public.reservations drop column if exists series_id;
drop table if exists public.reservation_series;
drop type if exists public.series_status;
drop table if exists public.reservation_equipment;
drop type if exists public.rental_status;
drop table if exists public.equipment_items;
drop table if exists public.pricing_rules;
alter table public.users drop column if exists push_notifications;
alter table public.users drop column if exists email_notifications;
-- protect_user_accounting_fields() is intentionally NOT reverted: the previous
-- version blocks the API's own token debits and refunds.
