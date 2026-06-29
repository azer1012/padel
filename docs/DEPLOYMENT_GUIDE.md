# Deployment Guide - Padel Club

This guide covers deploying the Padel Club application to production.

---

## Prerequisites

- Node.js 22.13.0+
- pnpm 9.0+
- Supabase account with a project
- Hosting platform (Vercel, Railway, Render, etc.)
- CDN for frontend (Vercel, Netlify, Cloudflare, etc.)

---

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note the following from project settings:
   - **Project ID** (e.g., `bnbdeymvdfrklbegwfgd`)
   - **Project URL** (e.g., `https://bnbdeymvdfrklbegwfgd.supabase.co`)
   - **Anon Key** (public API key)
   - **Service Role Key** (private API key)

### 1.2 Run Migrations

```bash
# Set environment variables
export SUPABASE_URL="https://bnbdeymvdfrklbegwfgd.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Push migrations
cd lib/db
pnpm run push
```

### 1.3 Verify Tables

In Supabase dashboard, check that all tables exist:
- users
- reservations
- reservation_players
- player_invites
- token_transactions
- notifications
- tournaments
- tournament_registrations
- terrains
- clubs
- news
- activity
- staff_roles

### 1.4 Create Storage Buckets

In Supabase dashboard, go to **Storage** and create buckets:

1. **avatars** (public, 5MB limit)
2. **clubs** (public, 5MB limit)
3. **courts** (public, 5MB limit)
4. **tournaments** (public, 5MB limit)
5. **gallery** (public, 5MB limit)

### 1.5 Configure OAuth Providers

In Supabase dashboard, go to **Authentication > Providers**:

1. **Google**
   - Add OAuth credentials from Google Cloud Console
   - Set redirect URL: `https://your-domain.com/auth/callback`

2. **Apple**
   - Add OAuth credentials from Apple Developer
   - Set redirect URL: `https://your-domain.com/auth/callback`

---

## Step 2: Environment Configuration

### 2.1 Backend Environment

Create `.env.local` in `artifacts/api-server/`:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# Supabase
SUPABASE_URL="https://bnbdeymvdfrklbegwfgd.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Server
NODE_ENV="production"
PORT="3000"
CORS_ORIGIN="https://your-frontend-domain.com"
FRONTEND_URL="https://your-frontend-domain.com"
LOG_LEVEL="info"
```

### 2.2 Frontend Environment

Create `.env.local` in `artifacts/padel-club/`:

```bash
# Supabase
VITE_SUPABASE_URL="https://bnbdeymvdfrklbegwfgd.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"

# API
VITE_API_URL="https://api.your-domain.com"
```

### 2.3 Root Environment (optional)

Create `.env.local` in project root for shared variables:

```bash
SUPABASE_URL="https://bnbdeymvdfrklbegwfgd.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
DATABASE_URL="postgresql://user:password@host:5432/database"
```

---

## Step 3: Build

### 3.1 Install Dependencies

```bash
pnpm install
```

### 3.2 Build Backend

```bash
cd artifacts/api-server
pnpm run build
```

Output: `dist/index.mjs`

### 3.3 Build Frontend

```bash
cd artifacts/padel-club
pnpm run build
```

Output: `dist/` directory

---

## Step 4: Deploy Backend

### Option A: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd artifacts/api-server
vercel deploy --prod
```

Configure in Vercel dashboard:
- **Build Command:** `pnpm run build`
- **Start Command:** `pnpm run start`
- **Environment Variables:** Set all from `.env.local`

### Option B: Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd artifacts/api-server
railway up
```

Configure in Railway dashboard:
- **Build Command:** `pnpm run build`
- **Start Command:** `pnpm run start`
- **Environment Variables:** Set all from `.env.local`

### Option C: Render

1. Go to [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repository
4. Configure:
   - **Build Command:** `cd artifacts/api-server && pnpm install && pnpm run build`
   - **Start Command:** `pnpm run start`
   - **Environment Variables:** Set all from `.env.local`

### Option D: Self-Hosted (Docker)

Create `Dockerfile` in `artifacts/api-server/`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm run build

# Expose port
EXPOSE 3000

# Start
CMD ["pnpm", "run", "start"]
```

Build and push:

```bash
docker build -t padel-api:latest .
docker tag padel-api:latest your-registry/padel-api:latest
docker push your-registry/padel-api:latest
```

---

## Step 5: Deploy Frontend

### Option A: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd artifacts/padel-club
vercel deploy --prod
```

Configure in Vercel dashboard:
- **Framework:** Vite
- **Build Command:** `pnpm run build`
- **Output Directory:** `dist`
- **Environment Variables:** Set from `.env.local`

### Option B: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd artifacts/padel-club
netlify deploy --prod --dir=dist
```

Or connect GitHub:
1. Go to [netlify.com](https://netlify.com)
2. Connect GitHub repository
3. Configure:
   - **Build Command:** `pnpm run build`
   - **Publish Directory:** `dist`
   - **Environment Variables:** Set from `.env.local`

### Option C: Cloudflare Pages

```bash
# Install Wrangler CLI
npm install -g wrangler

# Deploy
cd artifacts/padel-club
wrangler pages deploy dist
```

Or connect GitHub:
1. Go to Cloudflare dashboard
2. Create new Pages project
3. Connect GitHub repository
4. Configure:
   - **Build Command:** `pnpm run build`
   - **Build Output Directory:** `dist`
   - **Environment Variables:** Set from `.env.local`

### Option D: AWS S3 + CloudFront

```bash
# Build
cd artifacts/padel-club
pnpm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name/

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

---

## Step 6: Configure Domain & SSL

### 6.1 Domain Setup

1. Point your domain to the hosting provider's nameservers
2. Configure DNS records:
   - **Frontend:** `www.your-domain.com` → Vercel/Netlify/etc.
   - **API:** `api.your-domain.com` → Backend hosting
   - **Supabase:** Use default Supabase domain

### 6.2 SSL Certificate

Most hosting providers (Vercel, Netlify, etc.) provide free SSL certificates.

For self-hosted:
```bash
# Using Let's Encrypt
certbot certonly --standalone -d your-domain.com -d api.your-domain.com
```

---

## Step 7: Verify Deployment

### 7.1 Health Check

```bash
# Backend
curl https://api.your-domain.com/api/health

# Expected response:
# { "status": "ok" }
```

### 7.2 Frontend

1. Visit `https://your-domain.com`
2. Sign up with email
3. Verify OAuth (Google/Apple)
4. Create a reservation
5. Check admin panel

### 7.3 Database

```bash
# Connect to Supabase
psql postgresql://user:password@host:5432/database

# Verify tables
\dt public.*

# Check RLS
SELECT * FROM pg_policies WHERE tablename = 'users';
```

---

## Step 8: Monitoring & Logging

### 8.1 Backend Logs

**Vercel:**
```bash
vercel logs api-server --prod
```

**Railway:**
```bash
railway logs
```

**Render:**
Dashboard → Logs tab

### 8.2 Error Tracking

Set up Sentry:

```bash
npm install @sentry/node @sentry/tracing
```

In `artifacts/api-server/src/app.ts`:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### 8.3 Performance Monitoring

Set up Datadog or similar service for:
- API response times
- Database query performance
- Error rates
- User activity

---

## Step 9: Backup & Recovery

### 9.1 Database Backups

Supabase provides automatic daily backups. Configure:

1. Go to Supabase dashboard
2. Settings → Backups
3. Enable automated backups
4. Set retention period (e.g., 30 days)

### 9.2 Manual Backup

```bash
# Backup database
pg_dump postgresql://user:password@host:5432/database > backup.sql

# Backup storage
aws s3 sync s3://your-bucket-name/ ./backup/
```

### 9.3 Restore

```bash
# Restore database
psql postgresql://user:password@host:5432/database < backup.sql

# Restore storage
aws s3 sync ./backup/ s3://your-bucket-name/
```

---

## Step 10: CI/CD Pipeline

### 10.1 GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm run test
      
      - name: Build
        run: pnpm run build
      
      - name: Deploy backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up
      
      - name: Deploy frontend
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: vercel deploy --prod
```

---

## Troubleshooting

### Issue: Database connection fails

**Solution:**
```bash
# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Issue: Supabase auth not working

**Solution:**
1. Verify Supabase URL and keys in `.env.local`
2. Check OAuth provider settings
3. Verify redirect URLs match deployment domain

### Issue: CORS errors

**Solution:**
1. Set `CORS_ORIGIN` to frontend domain
2. Verify frontend URL in environment
3. Check browser console for specific error

### Issue: Storage uploads fail

**Solution:**
1. Verify storage buckets exist
2. Check bucket policies
3. Verify file size and MIME type

### Issue: RLS policies blocking access

**Solution:**
1. Check that user is authenticated
2. Verify user role in database
3. Review RLS policy conditions
4. Check Supabase logs for policy violations

---

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Migrations applied
- [ ] Storage buckets created with policies
- [ ] OAuth providers configured
- [ ] Environment variables set on hosting platform
- [ ] Backend built and deployed
- [ ] Frontend built and deployed
- [ ] Domain configured with SSL
- [ ] Health checks passing
- [ ] Smoke tests completed
- [ ] Error tracking configured
- [ ] Backups enabled
- [ ] CI/CD pipeline set up
- [ ] Monitoring configured
- [ ] Documentation updated

---

## Support

For issues or questions:
1. Check logs: `vercel logs`, `railway logs`, etc.
2. Review Supabase dashboard
3. Check GitHub Issues
4. Contact support team

---

**Last Updated:** June 10, 2026
