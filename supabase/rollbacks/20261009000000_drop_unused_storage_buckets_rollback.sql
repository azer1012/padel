-- Rollback for 20261009000000_drop_unused_storage_buckets.sql
-- Recreates the five empty buckets as they were (public, images only, no policy: the
-- browser roles can neither list nor upload). Nothing in the application uses them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('clubs', 'clubs', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('courts', 'courts', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('tournaments', 'tournaments', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('gallery', 'gallery', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;
