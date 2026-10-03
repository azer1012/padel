-- ============================================================================
-- Photo upload: the desk picks a photo instead of pasting a link (courts, news,
-- tournaments, boutique articles), and a boutique article shows several photos.
--
--   storage bucket "media"    private: no browser role reads or writes it. The API
--                             uploads with its service role and serves the photos
--                             itself (GET /api/media/<key>).
--   media_files               one row per uploaded photo: who, when, what. The API
--                             removes the photos no page uses any more.
--   shop_products.image_urls  the photos of an article, the first one on the card.
--                             Replaces image_url (its value is kept as first photo).
--
-- Rollback: supabase/rollbacks/20261012000000_photo_uploads_rollback.sql
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_files (
  id serial primary key,
  -- Name of the file in the bucket, and the end of its address: /api/media/<key>
  key text not null unique check (key ~ '^[a-f0-9]{32}\.(jpg|png|webp)$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0 and bytes <= 5242880),
  uploaded_by integer references public.users(id) on delete set null,
  created_at timestamp not null default now()
);
create index if not exists media_files_created_idx on public.media_files (created_at);
create index if not exists media_files_uploaded_by_idx on public.media_files (uploaded_by);

-- Same access model as every other table: only the API reads or writes
alter table public.media_files enable row level security;
revoke all on public.media_files from anon, authenticated;
revoke all on sequence public.media_files_id_seq from anon, authenticated;

-- Boutique: several photos per article, the first one is the cover
alter table public.shop_products
  add column if not exists image_urls text[] not null default '{}';
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'shop_products'
                and column_name = 'image_url') then
    update public.shop_products set image_urls = array[image_url]
     where image_url is not null and image_urls = '{}';
    alter table public.shop_products drop column image_url;
  end if;
end $$;
do $$ begin
  alter table public.shop_products add constraint shop_products_image_urls_check
    check (cardinality(image_urls) <= 6);
exception when duplicate_object then null; end $$;
