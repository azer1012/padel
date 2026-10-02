-- ============================================================================
-- Player gender, asked at signup (with phone, first and last name).
--
-- Additive migration: a new enum, a new nullable column, and the signup trigger
-- now also copies `gender` from the auth metadata. Existing players keep NULL
-- until they fill it in from their profile.
-- ============================================================================

do $$ begin
  create type public.gender as enum ('male', 'female');
exception when duplicate_object then null;
end $$;

alter table public.users add column if not exists gender public.gender;

-- Same function as 20261002000000 §5, plus gender. Unknown values are ignored
-- (the metadata is written by the browser, so never trusted to match the enum).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := nullif(trim(coalesce(meta->>'full_name', meta->>'name', '')), '');
  g text := lower(trim(coalesce(meta->>'gender', '')));
begin
  -- Same email re-registered after its previous auth account was deleted: relink.
  update public.users u
     set supabase_auth_id = new.id::text, updated_at = now()
   where new.email is not null
     and lower(u.email) = lower(new.email)
     and not exists (select 1 from auth.users a where a.id::text = u.supabase_auth_id);
  if found then
    return new;
  end if;

  insert into public.users (supabase_auth_id, email, first_name, last_name, phone, gender, avatar_url)
  values (
    new.id::text,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    left(nullif(trim(coalesce(meta->>'first_name', split_part(full_name, ' ', 1), '')), ''), 80),
    left(nullif(trim(coalesce(meta->>'last_name',
      nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), ''), '')), ''), 80),
    left(nullif(trim(coalesce(meta->>'phone', '')), ''), 30),
    case when g in ('male', 'female') then g::public.gender end,
    nullif(meta->>'avatar_url', '')
  )
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from anon, authenticated, public;
