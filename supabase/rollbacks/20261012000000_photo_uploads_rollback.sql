-- ============================================================================
-- Rollback of 20261012000000_photo_uploads.sql
--
-- Guarded: stops without changing anything while the "media" bucket holds a photo,
-- because the pages showing it would lose it. Empty the bucket first (Supabase
-- dashboard → Storage → media), or put links back on the pages that use them.
-- An article keeps its first photo; its other photos are dropped.
-- ============================================================================
do $$
declare
  n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'media';
  if n > 0 then
    raise exception 'the media bucket holds % photo(s): empty it before rolling back', n;
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'media';
  perform set_config('storage.allow_delete_query', 'false', true);
end $$;

alter table public.shop_products drop constraint if exists shop_products_image_urls_check;
alter table public.shop_products add column if not exists image_url text;
update public.shop_products set image_url = image_urls[1] where cardinality(image_urls) > 0;
alter table public.shop_products drop column if exists image_urls;

drop table if exists public.media_files;
