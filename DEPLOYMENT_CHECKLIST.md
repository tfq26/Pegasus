# Vercel Deployment Checklist

## Backend Environment Variables (Set in Vercel)

```bash
# Authentication
WORKOS_API_KEY=sk_test_your_key_here
WORKOS_CLIENT_ID=client_your_id_here
JWT_SECRET=your_random_32_char_secret
WORKOS_REDIRECT_URI=https://your-backend.vercel.app/auth/callback

# Database
TURSO_DB_URL=your_turso_url
TURSO_AUTH_TOKEN=your_turso_token
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# AI
GEMINI_API_KEY=your_gemini_key

# Email (Optional)
RESEND_API_KEY=re_your_key
DEVELOPER_EMAIL=your@email.com

# CORS (CRITICAL!)
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

## Frontend Environment Variables (Set in Vercel)

```bash
VITE_QUERY_API_URL=https://your-backend.vercel.app
```

## Pre-Deployment Steps

- [ ] Update WorkOS redirect URI in WorkOS dashboard
- [ ] Create Neon database table (run SQL from walkthrough)
- [ ] Set all environment variables in Vercel
- [ ] Test build locally: `bun run build`
- [ ] Verify .env files are in .gitignore
- [ ] Run lint: `bun run lint`

## Post-Deployment Steps

- [ ] Test authentication flow
- [ ] Test database connections
- [ ] Test feedback form submission
- [ ] Verify CORS is working
- [ ] Check browser console for errors

## Vercel Project Settings

### Monorepo Setup (Using Turborepo)

**Root Settings:**
- Install Command: `bun install`
- Build Command: `cd apps/[backend|ui] && bun run build`

### Backend Project
- Framework Preset: Other
- Root Directory: `apps/backend`
- Build Command: `bun run build`
- Output Directory: `apps/backend`
- Install Command: `bun install`

### Frontend Project
- Framework Preset: Vite
- Root Directory: `apps/ui`
- Build Command: `bun run build`
- Output Directory: `apps/ui/dist`
- Install Command: `bun install`

## Turborepo Commands

```bash
# Development
bun run dev          # Run all workspaces in dev mode

# Production Build
bun run build        # Build all workspaces with caching

# Linting
bun run lint         # Lint all workspaces

# Clean
bun run clean        # Remove node_modules and build artifacts
```
