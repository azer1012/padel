-- ============================================================================
-- Audit trail: staff actions that were not recorded anywhere are now filed in
-- the activity log (Admin → activity feed):
--   payment_updated  a cash payment marked received / not received at the desk
--   role_changed     a member promoted to admin or back to player
--   court_updated    a court created, edited, put in maintenance, archived, deleted
--   pricing_updated  a peak / off-peak pricing rule created, edited or deleted
--
-- Additive: only the list of allowed activity types grows. No data is changed.
-- ============================================================================
alter table public.activity drop constraint if exists activity_type_check;
alter table public.activity add constraint activity_type_check check (type in (
  'reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited',
  'user_registered', 'settings_updated',
  'payment_updated', 'role_changed', 'court_updated', 'pricing_updated'
));

-- The activity feed reads the latest entries first
create index if not exists activity_created_idx on public.activity (created_at desc);

-- club_settings.updated_by → users(id): the one foreign key without a covering index
create index if not exists club_settings_updated_by_idx on public.club_settings (updated_by);
