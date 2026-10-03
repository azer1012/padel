-- ============================================================================
-- Removes the five storage buckets of the first prototype:
--   avatars, clubs, courts, tournaments, gallery
--
-- The product never uploads a file: photos are files of the site or links typed by
-- the admin, and no screen or API route reads a bucket. Their policies were dropped
-- in 20261002000000; the buckets themselves stayed, public and empty.
--
-- Guarded: stops without changing anything if one of them holds a file.
-- Supabase refuses a plain DELETE on its storage tables, because it would leave the
-- files behind; storage.allow_delete_query lifts that refusal for this transaction
-- only, which is safe here: the buckets are checked empty first.
-- Rollback: supabase/rollbacks/20261009000000_drop_unused_storage_buckets_rollback.sql
-- ============================================================================
do $$
declare
  n bigint;
begin
  select count(*) into n from storage.objects
   where bucket_id in ('avatars', 'clubs', 'courts', 'tournaments', 'gallery');
  if n > 0 then
    raise exception 'the prototype''s storage buckets hold % file(s): review them before removing the buckets', n;
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id in ('avatars', 'clubs', 'courts', 'tournaments', 'gallery');
  perform set_config('storage.allow_delete_query', 'false', true);
end $$;
