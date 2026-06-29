-- Align news table with Drizzle schema
ALTER TABLE public.news RENAME COLUMN published TO is_published;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS published_at timestamp;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS excerpt text;

-- Align activity table with Drizzle enum if possible, or ensure compatibility
-- Drizzle uses: reservation_created, reservation_cancelled, token_credited, token_debited, user_registered
-- Current SQL uses text. We'll keep text but add a check constraint for safety.
ALTER TABLE public.activity ADD CONSTRAINT activity_type_check 
CHECK (type IN ('reservation_created', 'reservation_cancelled', 'token_credited', 'token_debited', 'user_registered'));

-- Align staff_roles table
-- Drizzle uses: manager, coach, receptionist, maintenance
-- Current SQL uses plain text.
ALTER TABLE public.staff_roles ADD COLUMN IF NOT EXISTS role_type text;
ALTER TABLE public.staff_roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.staff_roles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update RLS for news to use the new column name
DROP POLICY IF EXISTS "news public published read" ON public.news;
CREATE POLICY "news public published read" ON public.news 
FOR SELECT USING (is_published = true OR public.current_app_user_is_admin());

-- Add missing constraints to reservations to match Drizzle/Business logic if not present
-- (Note: some were already in the previous migration, adding others)
ALTER TABLE public.reservations ALTER COLUMN tokens_charged SET DEFAULT 1;
ALTER TABLE public.reservations ALTER COLUMN total_spots SET DEFAULT 4;

-- Ensure reservation_players has the unique constraint
-- (Already in migration but good to be sure)
-- ALTER TABLE public.reservation_players ADD CONSTRAINT reservation_players_res_user_unique UNIQUE (reservation_id, user_id);
