-- ============================================================================
-- Members: an account can be blocked by the club, or deleted by its owner.
-- Cash: what the desk collects is dated, so a day can be closed.
--
--   users.blocked_at / blocked_reason   a blocked member can no longer use the API
--                                       (no booking, no order); their history stays
--   users.deleted_at                    the member deleted their account: the row is
--                                       kept, emptied of everything personal, because
--                                       bookings and the token ledger point to it
--   reservation_players.cash_amount     what a spot paid at the club brought in,
--                        .paid_at       when the desk marked it paid,
--                        .paid_by       and who did
--   shop_orders.delivered_at            when an order was handed over and paid
--
-- Additive: new columns, no existing value changes (delivered orders get their
-- delivery date from updated_at). Two audit-trail types are added.
-- Rollback: supabase/rollbacks/20261010000000_member_accounts_cash_report_rollback.sql
-- ============================================================================
alter table public.users
  add column if not exists blocked_at timestamp,
  add column if not exists blocked_reason text,
  add column if not exists deleted_at timestamp;

alter table public.reservation_players
  add column if not exists cash_amount numeric(10, 2),
  add column if not exists paid_at timestamp,
  add column if not exists paid_by integer references public.users(id) on delete set null;
do $$ begin
  alter table public.reservation_players add constraint reservation_players_cash_amount_check
    check (cash_amount is null or cash_amount >= 0);
exception when duplicate_object then null; end $$;
create index if not exists reservation_players_paid_at_idx
  on public.reservation_players (paid_at) where paid_at is not null;
create index if not exists reservation_players_paid_by_idx on public.reservation_players (paid_by);
create index if not exists token_transactions_cash_idx
  on public.token_transactions (created_at) where cash_amount is not null;

alter table public.shop_orders add column if not exists delivered_at timestamp;
update public.shop_orders set delivered_at = updated_at
 where status = 'delivered' and delivered_at is null;
create index if not exists shop_orders_delivered_at_idx
  on public.shop_orders (delivered_at) where delivered_at is not null;

-- Audit trail: what staff did to a member's account, and to a tournament's teams
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated',
  'shop_updated', 'order_updated',
  'member_updated', 'tournament_updated'
));
