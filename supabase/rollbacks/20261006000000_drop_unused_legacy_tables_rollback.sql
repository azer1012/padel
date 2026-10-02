-- Rollback for 20261006000000_drop_unused_legacy_tables.sql
-- Recreates the two empty tables and the column (private: RLS on, no policy, no
-- access for the browser roles). Nothing in the application uses them.
create table if not exists public.clubs (
  id serial primary key,
  name text not null,
  description text,
  address text,
  phone text,
  email text,
  logo_url text,
  cover_url text,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp
);
alter table public.clubs enable row level security;
revoke all on public.clubs from anon, authenticated;

create table if not exists public.staff_roles (
  id serial primary key,
  user_id integer not null references public.users(id),
  role_type text,
  description text,
  is_active boolean default true,
  created_at timestamp not null default now()
);
alter table public.staff_roles enable row level security;
revoke all on public.staff_roles from anon, authenticated;

alter table public.terrains add column if not exists capacity integer not null default 4 check (capacity > 0);
