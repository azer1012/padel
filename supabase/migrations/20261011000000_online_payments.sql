-- ============================================================================
-- Online payment: a member buys tokens, or pays a boutique order, through the club's
-- payment gateway (Konnect or Flouci, chosen per installation in the environment).
--
--   payments                  one row per payment asked for. It becomes 'paid' only
--                             when the API itself has asked the gateway and the
--                             gateway confirms the amount; the tokens are then
--                             credited through the ledger (once), or the order marked
--                             paid. A paid order the desk cancels becomes 'refund_due'
--                             until the desk has refunded it in the gateway's
--                             back-office ('refunded').
--   shop_orders.paid_online_at   the order is already paid: nothing to collect
--   club_settings.online_payment_enabled   the club's switch (Réglages)
--
-- Additive: one new table, two new columns with defaults, one audit-trail type.
-- Rollback: supabase/rollbacks/20261011000000_online_payments_rollback.sql
-- ============================================================================
alter table public.club_settings
  add column if not exists online_payment_enabled boolean not null default true;

alter table public.shop_orders add column if not exists paid_online_at timestamp;

do $$ begin
  create type public.payment_status as enum
    ('pending', 'paid', 'failed', 'expired', 'refund_due', 'refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.payments (
  id serial primary key,
  user_id integer not null references public.users(id),
  provider text not null check (provider in ('konnect', 'flouci', 'test')),
  purpose text not null check (purpose in ('tokens', 'shop_order')),
  status public.payment_status not null default 'pending',
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null,
  -- Tokens bought (a pack, or a number of tokens at the club's unit price)
  tokens integer check (tokens is null or tokens > 0),
  package_id integer references public.token_packages(id) on delete set null,
  -- The boutique order paid
  shop_order_id integer references public.shop_orders(id),
  -- The gateway's own reference, and the page the member pays on
  provider_ref text,
  checkout_url text,
  -- The ledger entry that credited the tokens: set once, with the payment
  token_transaction_id integer references public.token_transactions(id),
  failure_reason text,
  paid_at timestamp,
  refunded_at timestamp,
  refunded_by integer references public.users(id) on delete set null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  constraint payments_purpose_fields check (
    (purpose = 'tokens' and tokens is not null and shop_order_id is null)
    or (purpose = 'shop_order' and shop_order_id is not null and tokens is null)
  )
);
-- A gateway reference belongs to one payment
create unique index if not exists payments_provider_ref_key
  on public.payments (provider, provider_ref) where provider_ref is not null;
-- An order is paid at most once: a second payment that goes through is owed back
create unique index if not exists payments_one_paid_order
  on public.payments (shop_order_id)
  where shop_order_id is not null and status = 'paid';
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_order_idx on public.payments (shop_order_id);
create index if not exists payments_status_idx on public.payments (status, created_at);
create index if not exists payments_paid_at_idx on public.payments (paid_at) where paid_at is not null;
create index if not exists payments_package_idx on public.payments (package_id);
create index if not exists payments_transaction_idx on public.payments (token_transaction_id);
create index if not exists payments_refunded_by_idx on public.payments (refunded_by);

-- Audit trail: money received online, and refunds made by the desk
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated',
  'shop_updated', 'order_updated',
  'member_updated', 'tournament_updated',
  'payment_received'
));

-- Same access model as every other table: only the API reads or writes
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
revoke all on sequence public.payments_id_seq from anon, authenticated;
