-- Rollback for 20261010000000_member_accounts_cash_report.sql
-- Loses who is blocked, which accounts were deleted, and the cash amounts and dates
-- recorded since the migration. Entries of the two new audit-trail types are refiled
-- under 'settings_updated' so the older constraint accepts them.
update public.activity set type = 'settings_updated'
 where type in ('member_updated', 'tournament_updated');
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated',
  'shop_updated', 'order_updated'
));

drop index if exists public.shop_orders_delivered_at_idx;
alter table public.shop_orders drop column if exists delivered_at;

drop index if exists public.token_transactions_cash_idx;
drop index if exists public.reservation_players_paid_by_idx;
drop index if exists public.reservation_players_paid_at_idx;
alter table public.reservation_players
  drop constraint if exists reservation_players_cash_amount_check,
  drop column if exists paid_by,
  drop column if exists paid_at,
  drop column if exists cash_amount;

alter table public.users
  drop column if exists deleted_at,
  drop column if exists blocked_reason,
  drop column if exists blocked_at;
