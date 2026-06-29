# Supabase Integration Guide

## Overview

This document provides a comprehensive guide to the Supabase integration for the Padel Club platform. The integration includes authentication, database, storage, and realtime features.

## Project Configuration

- **Project ID:** `bnbdeymvdfrklbegwfgd`
- **Supabase URL:** `https://bnbdeymvdfrklbegwfgd.supabase.co`
- **Anon Key:** `sb_publishable_djf-sCYL4Tg45hakr9YAfA_riahXdaR`

## Environment Variables

### Development (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://bnbdeymvdfrklbegwfgd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_djf-sCYL4Tg45hakr9YAfA_riahXdaR
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
DATABASE_URL=postgresql://postgres:password@db.bnbdeymvdfrklbegwfgd.supabase.co:5432/postgres
```

### Production

Set the same variables in your hosting provider's environment configuration.

## Authentication

### Supported Methods

1. **Email/Password Auth**
   - User registration and login
   - Password reset functionality
   - Email verification

2. **OAuth Providers**
   - Google OAuth
   - Apple OAuth

### Implementation

Frontend authentication is handled through the `AuthProvider` in `src/lib/auth.tsx`:

```typescript
import { supabase } from "@/lib/supabase";

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: "user@example.com",
  password: "password",
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "password",
});

// Sign out
await supabase.auth.signOut();
```

### Session Persistence

Sessions are automatically persisted using localStorage with the key `padel-club-auth`. The session is restored on page reload.

## Database Schema

### Core Tables

1. **users** - User profiles and authentication mapping
2. **reservations** - Court booking reservations
3. **reservation_players** - Players participating in reservations
4. **player_invites** - Invitations to join reservations
5. **token_transactions** - Token balance transactions
6. **notifications** - User notifications
7. **tournaments** - Tournament management
8. **tournament_registrations** - Tournament participant registrations
9. **terrains** - Court/terrain information
10. **clubs** - Club information
11. **news** - News articles
12. **activity** - Activity log
13. **staff_roles** - Staff role assignments

### Key Relationships

- Users have many reservations
- Reservations have many reservation_players
- Reservations have many player_invites
- Users have many token_transactions
- Users have many notifications
- Users can register for many tournaments

## Row Level Security (RLS)

All tables have RLS enabled with the following policies:

### Users Table

- **Select:** Users can view their own profile or admins can view all
- **Update:** Users can update their own profile
- **Admin:** Admins have full access

### Reservations Table

- **Select:** Visible to owner, participants, admins, or if public
- **Insert:** Only the reservation creator can insert
- **Update:** Owner or admin can update

### Reservation Players Table

- **Select:** Visible to participants, reservation owner, or admin
- **Insert:** Participants or admin can insert
- **Update:** Admin only

### Token Transactions Table

- **Select:** User can view their own transactions or admin can view all
- **Insert:** Admin only
- **Update:** Immutable (no updates allowed)

### Notifications Table

- **Select:** User can view their own notifications or admin can view all
- **Update:** User can update read status of their own notifications
- **Insert:** Admin only

### Storage Buckets

| Bucket | Size Limit | Allowed MIME Types | Public |
|--------|------------|-------------------|--------|
| avatars | 5 MB | JPEG, PNG, WebP, AVIF | Yes |
| clubs | 10 MB | JPEG, PNG, WebP, AVIF | Yes |
| courts | 10 MB | JPEG, PNG, WebP, AVIF | Yes |
| tournaments | 10 MB | JPEG, PNG, WebP, AVIF | Yes |
| gallery | 10 MB | JPEG, PNG, WebP, AVIF | Yes |

#### Storage Policies

- **Public Read:** All buckets are publicly readable
- **Avatar Upload:** Users can upload to their own avatar folder
- **Admin Upload:** Admins can upload to clubs, courts, tournaments, and gallery buckets

## Realtime Features

The following tables are configured for realtime subscriptions:

- reservations
- reservation_players
- player_invites
- notifications
- token_transactions
- users

### Usage Example

```typescript
import { subscribeToUserNotifications } from "@/utils/api/realtime";

// Subscribe to user notifications
const channel = await subscribeToUserNotifications(userId, (payload) => {
  console.log("New notification:", payload);
});

// Unsubscribe when done
await supabase.removeChannel(channel);
```

## API Integration

### Server-Side Supabase Client

The server uses the admin client for privileged operations:

```typescript
import { supabaseAdmin } from "@/config/supabase";

// Admin operations
const { data, error } = await supabaseAdmin
  .from("users")
  .select("*");
```

### Client-Side Supabase Client

The frontend uses the public client for user-initiated operations:

```typescript
import { supabase } from "@/lib/supabase";

// User operations
const { data, error } = await supabase
  .from("reservations")
  .select("*");
```

## Migrations

Database migrations are stored in `supabase/migrations/` and applied in order.

### Current Migrations

- `20260527190000_production_schema.sql` - Initial production schema

### Applying Migrations

```bash
# Apply migrations
pnpm --dir scripts run db:migrate

# Or manually using Supabase CLI
supabase db push
```

## Edge Functions

The following edge functions are configured:

1. **notifications** - Send notifications to users
2. **reservation-reminders** - Send reservation reminders
3. **token-processing** - Process token transactions
4. **expire-invitations** - Expire old invitations

### Deploying Edge Functions

```bash
supabase functions deploy
```

## Security Considerations

### Secrets Management

- Never commit `.env.local` to version control
- Use `.env.example` as a template
- Store production secrets in your hosting provider's environment configuration

### API Keys

- **Anon Key:** Public key for client-side operations (safe to expose)
- **Service Role Key:** Private key for server-side operations (never expose)

### Token Refresh

Supabase automatically refreshes tokens when they expire. The client is configured with:

```typescript
{
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
  }
}
```

## Troubleshooting

### Authentication Issues

1. Verify the anon key is correct in `.env.local`
2. Check that email/password authentication is enabled in Supabase
3. Verify OAuth providers are configured if using OAuth

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Check that the database is accessible from your network
3. Verify credentials in the connection string

### RLS Policy Issues

1. Check that the user is authenticated
2. Verify the user's role in the database
3. Review RLS policies in the migration file

### Realtime Subscription Issues

1. Verify the table has realtime enabled
2. Check that the filter syntax is correct
3. Verify the user has permission to read the table

## Best Practices

1. **Always use parameterized queries** to prevent SQL injection
2. **Validate input** on both client and server
3. **Use RLS policies** to enforce data access control
4. **Enable HTTPS** for all API calls
5. **Rotate secrets** regularly
6. **Monitor usage** and set up alerts
7. **Test RLS policies** thoroughly before production
8. **Use transactions** for complex operations

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Realtime Guide](https://supabase.com/docs/guides/realtime)
