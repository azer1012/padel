# Row Level Security (RLS) Policies

## Overview

This document details all RLS policies implemented in the Padel Club database to ensure data security and proper access control.

## Policy Structure

All policies follow this naming convention: `<table>_<action>_<description>`

## Users Table Policies

### 1. users_select_own_or_admin
**Action:** SELECT  
**Condition:** `supabase_auth_id = auth.uid()::text OR current_app_user_is_admin()`  
**Purpose:** Users can view their own profile; admins can view all users

### 2. users_update_own_profile
**Action:** UPDATE  
**Using:** `supabase_auth_id = auth.uid()::text`  
**With Check:** `supabase_auth_id = auth.uid()::text`  
**Purpose:** Users can only update their own profile

### 3. users_admin_all
**Action:** ALL (INSERT, UPDATE, DELETE)  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Admins have full access to user management

### Protected Fields

The `protect_user_accounting_fields()` trigger prevents non-admin users from modifying:
- `role`
- `token_balance`
- `supabase_auth_id`

## Reservations Table Policies

### 1. reservations_visible_to_owner_players_public_or_admin
**Action:** SELECT  
**Condition:** 
```sql
current_app_user_is_admin()
OR user_id = current_app_user_id()
OR is_public = true
OR EXISTS (
  SELECT 1 FROM reservation_players rp
  WHERE rp.reservation_id = reservations.id 
  AND rp.user_id = current_app_user_id()
)
```
**Purpose:** Visible to admins, owner, participants, or if public

### 2. reservations_insert_own
**Action:** INSERT  
**With Check:** `user_id = current_app_user_id()`  
**Purpose:** Users can only create reservations for themselves

### 3. reservations_update_owner_or_admin
**Action:** UPDATE  
**Using:** `current_app_user_is_admin() OR user_id = current_app_user_id()`  
**Purpose:** Only owner or admin can update reservations

## Reservation Players Table Policies

### 1. reservation_players_visible_to_participants_or_admin
**Action:** SELECT  
**Condition:**
```sql
current_app_user_is_admin()
OR user_id = current_app_user_id()
OR EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.id = reservation_players.reservation_id 
  AND r.user_id = current_app_user_id()
)
```
**Purpose:** Visible to admins, the player, or the reservation owner

### 2. reservation_players_insert_self
**Action:** INSERT  
**With Check:** `user_id = current_app_user_id() OR current_app_user_is_admin()`  
**Purpose:** Users can add themselves or admins can add anyone

### 3. reservation_players_update_admin_only
**Action:** UPDATE  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can modify player records

## Player Invites Table Policies

### 1. invites_visible_to_creator_reservation_owner_or_admin
**Action:** SELECT  
**Condition:**
```sql
current_app_user_is_admin()
OR invited_by_user_id = current_app_user_id()
OR EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.id = player_invites.reservation_id 
  AND r.user_id = current_app_user_id()
)
```
**Purpose:** Visible to admins, invite creator, or reservation owner

### 2. invites_create_by_authenticated_users
**Action:** INSERT  
**With Check:** `invited_by_user_id = current_app_user_id()`  
**Purpose:** Authenticated users can create invites for themselves

### 3. invites_update_by_creator_or_admin
**Action:** UPDATE  
**Using:** `current_app_user_is_admin() OR invited_by_user_id = current_app_user_id()`  
**Purpose:** Creator or admin can update invites

## Token Transactions Table Policies

### 1. token_transactions_select_own_or_admin
**Action:** SELECT  
**Using:** `current_app_user_is_admin() OR user_id = current_app_user_id()`  
**Purpose:** Users can view their own transactions; admins can view all

### 2. token_transactions_admin_insert_only
**Action:** INSERT  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can create token transactions

### 3. token_transactions_immutable_except_admin
**Action:** UPDATE  
**Using:** `false`  
**Purpose:** Token transactions are immutable (no updates allowed)

## Notifications Table Policies

### 1. notifications_select_own_or_admin
**Action:** SELECT  
**Using:** `current_app_user_is_admin() OR user_id = current_app_user_id()`  
**Purpose:** Users can view their own notifications; admins can view all

### 2. notifications_update_own_read_state
**Action:** UPDATE  
**Using:** `user_id = current_app_user_id()`  
**With Check:** `user_id = current_app_user_id()`  
**Purpose:** Users can only update the read status of their own notifications

### 3. notifications_admin_insert
**Action:** INSERT  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can create notifications

## Tournaments Table Policies

### 1. tournaments_public_read
**Action:** SELECT  
**Using:** `true`  
**Purpose:** Tournaments are publicly readable

### 2. tournaments_admin_write
**Action:** ALL (INSERT, UPDATE, DELETE)  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can manage tournaments

## Tournament Registrations Table Policies

### 1. tournament_registrations_own_or_admin_read
**Action:** SELECT  
**Using:** `current_app_user_is_admin() OR user_id = current_app_user_id()`  
**Purpose:** Users can view their own registrations; admins can view all

### 2. tournament_registrations_insert_own
**Action:** INSERT  
**With Check:** `user_id = current_app_user_id()`  
**Purpose:** Users can only register themselves

## Terrains Table Policies

### 1. terrains_public_read
**Action:** SELECT  
**Using:** `true`  
**Purpose:** Terrains are publicly readable

### 2. terrains_admin_write
**Action:** ALL (INSERT, UPDATE, DELETE)  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can manage terrains

## Clubs Table Policies

### 1. clubs_public_read
**Action:** SELECT  
**Using:** `true`  
**Purpose:** Clubs are publicly readable

### 2. clubs_admin_write
**Action:** ALL (INSERT, UPDATE, DELETE)  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can manage clubs

## News Table Policies

### 1. news_public_published_read
**Action:** SELECT  
**Using:** `published = true OR current_app_user_is_admin()`  
**Purpose:** Published news is public; admins can view all

### 2. news_admin_write
**Action:** ALL (INSERT, UPDATE, DELETE)  
**Using:** `current_app_user_is_admin()`  
**With Check:** `current_app_user_is_admin()`  
**Purpose:** Only admins can manage news

## Storage Policies

### 1. public_image_read
**Action:** SELECT  
**Using:** `bucket_id IN ('avatars', 'clubs', 'courts', 'tournaments', 'gallery')`  
**Purpose:** All images are publicly readable

### 2. own_avatar_upload
**Action:** INSERT  
**With Check:** `bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]`  
**Purpose:** Users can upload avatars to their own folder

### 3. own_avatar_update
**Action:** UPDATE  
**Using:** `bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]`  
**Purpose:** Users can update their own avatars

### 4. admin_media_upload
**Action:** INSERT  
**With Check:** `bucket_id IN ('clubs', 'courts', 'tournaments', 'gallery') AND current_app_user_is_admin()`  
**Purpose:** Admins can upload media to managed buckets

### 5. admin_media_update
**Action:** UPDATE  
**Using:** `bucket_id IN ('clubs', 'courts', 'tournaments', 'gallery') AND current_app_user_is_admin()`  
**Purpose:** Admins can update media in managed buckets

### 6. admin_media_delete
**Action:** DELETE  
**Using:** `bucket_id IN ('clubs', 'courts', 'tournaments', 'gallery') AND current_app_user_is_admin()`  
**Purpose:** Admins can delete media from managed buckets

## Security Functions

### current_app_user_id()
Returns the application user ID for the authenticated Supabase user.

```sql
SELECT id FROM public.users 
WHERE supabase_auth_id = auth.uid()::text
```

### current_app_user_is_admin()
Returns true if the authenticated user has the admin role.

```sql
SELECT EXISTS (
  SELECT 1 FROM public.users 
  WHERE supabase_auth_id = auth.uid()::text 
  AND role = 'admin'
)
```

## Testing RLS Policies

### Test Cases

1. **User accessing own data** - Should succeed
2. **User accessing other user's data** - Should fail
3. **Admin accessing any data** - Should succeed
4. **Unauthenticated user accessing public data** - Should succeed
5. **Unauthenticated user accessing private data** - Should fail

### Testing Command

```bash
# Use Supabase CLI to test policies
supabase test db
```

## Maintenance

### Monitoring

- Review access logs regularly
- Monitor for policy violations
- Audit admin actions

### Updates

- Test policy changes in development first
- Document any policy modifications
- Keep this document in sync with actual policies

## Common Issues

### Issue: Users can't see their own data
**Solution:** Verify `current_app_user_id()` returns correct value

### Issue: Admins can't access data
**Solution:** Verify user has admin role in database

### Issue: Public data not accessible
**Solution:** Check that RLS policy uses `true` for public access

### Issue: Storage uploads failing
**Solution:** Verify storage policies and bucket names match
