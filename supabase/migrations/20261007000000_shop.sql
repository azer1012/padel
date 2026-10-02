-- ============================================================================
-- Boutique: the club sells padel articles (rackets, balls, bags, clothing).
--
--   shop_products     the catalogue, edited by the admins
--   shop_orders       an order placed by a member from the site. No online payment:
--                     the club calls the member to confirm, then delivers or keeps
--                     the order at the desk; it is paid in cash on reception.
--   shop_order_items  the lines of an order, with the name and price at order time
--                     (a later price change never rewrites a past order)
--
-- Stock is taken when the order is placed and given back when it is cancelled.
-- Additive: new tables, one new setting, new notification and audit types.
-- Rollback: supabase/rollbacks/20261007000000_shop_rollback.sql
-- ============================================================================

alter table public.club_settings add column if not exists shop_enabled boolean not null default true;

do $$ begin
  create type public.shop_order_status as enum ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.shop_products (
  id serial primary key,
  name text not null,
  description text,
  category text not null default 'accessory',
  price numeric(10, 2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists public.shop_orders (
  id serial primary key,
  user_id integer not null references public.users(id),
  status public.shop_order_status not null default 'pending',
  total numeric(10, 2) not null check (total >= 0),
  currency text not null,
  delivery_method text not null check (delivery_method in ('delivery', 'pickup')),
  contact_name text not null,
  contact_phone text not null,
  address text,
  city text,
  notes text,
  admin_notes text,
  -- One per checkout: a double tap or a retried request creates one order
  idempotency_key text,
  handled_by integer references public.users(id) on delete set null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  -- A delivery needs somewhere to go
  constraint shop_orders_delivery_address check (delivery_method = 'pickup' or address is not null)
);
create unique index if not exists shop_orders_idempotency_key on public.shop_orders (idempotency_key)
  where idempotency_key is not null;
create index if not exists shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_status_idx on public.shop_orders (status, created_at desc);
create index if not exists shop_orders_handled_by_idx on public.shop_orders (handled_by);

create table if not exists public.shop_order_items (
  id serial primary key,
  order_id integer not null references public.shop_orders(id) on delete cascade,
  product_id integer not null references public.shop_products(id),
  product_name text not null,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  unique (order_id, product_id)
);
create index if not exists shop_order_items_product_idx on public.shop_order_items (product_id);

-- Notifications: the admins when an order arrives, the member when it moves on
alter type public.notification_type add value if not exists 'order_placed';
alter type public.notification_type add value if not exists 'order_update';

-- Audit trail: catalogue changes and what staff did with an order
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated',
  'shop_updated', 'order_updated'
));

-- Same access model as every other table: only the API reads or writes
alter table public.shop_products enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
revoke all on public.shop_products, public.shop_orders, public.shop_order_items from anon, authenticated;
revoke all on sequence public.shop_products_id_seq, public.shop_orders_id_seq, public.shop_order_items_id_seq
  from anon, authenticated;
