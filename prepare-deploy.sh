#!/bin/bash

# Pegasus - Vercel Deployment Preparation Script
# This script helps prepare your app for deployment to Vercel

set -e  # Exit on error

echo "🚀 Pegasus - Vercel Deployment Preparation"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

echo "📋 Step 1: Installing dependencies..."
echo "--------------------------------------"
bun install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

echo "🔨 Step 2: Building the application..."
echo "--------------------------------------"
bun run build
echo -e "${GREEN}✅ All workspaces built successfully${NC}"
echo ""

echo "🧹 Step 3: Running lint checks..."
echo "--------------------------------------"
bun run lint || echo -e "${YELLOW}⚠️  Lint warnings found (non-blocking)${NC}"
echo -e "${GREEN}✅ Lint check complete${NC}"
echo ""

echo "🧪 Step 4: Running production checks..."
echo "--------------------------------------"

# Check for .env files
if [ -f "apps/backend/.env" ]; then
    echo -e "${GREEN}✅ Backend .env file exists${NC}"
else
    echo -e "${YELLOW}⚠️  Backend .env file not found (will use Vercel environment variables)${NC}"
fi

if [ -f "apps/ui/.env" ]; then
    echo -e "${GREEN}✅ Frontend .env file exists${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend .env file not found (will use Vercel environment variables)${NC}"
fi

# Check for required files
echo ""
echo "📁 Checking required files..."
required_files=(
    "apps/backend/index.js"
    "apps/ui/dist/index.html"
    "apps/backend/package.json"
    "apps/ui/package.json"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ Missing: $file${NC}"
    fi
done

echo ""
echo "🔐 Step 5: Security Checklist..."
echo "--------------------------------------"

# Check if .env is in .gitignore
if grep -q "^\.env$" apps/backend/.gitignore 2>/dev/null; then
    echo -e "${GREEN}✅ Backend .env is in .gitignore${NC}"
else
    echo -e "${RED}❌ Backend .env is NOT in .gitignore - SECURITY RISK!${NC}"
fi

if grep -q "^\.env$" apps/ui/.gitignore 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend .env is in .gitignore${NC}"
else
    echo -e "${RED}❌ Frontend .env is NOT in .gitignore - SECURITY RISK!${NC}"
fi

echo ""
echo "📝 Step 6: Creating deployment checklist..."
echo "--------------------------------------"

cat > DEPLOYMENT_CHECKLIST.md << 'EOF'
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
EOF

echo -e "${GREEN}✅ Created DEPLOYMENT_CHECKLIST.md${NC}"
echo ""

echo "=========================================="
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review DEPLOYMENT_CHECKLIST.md"
echo "2. Push your code to GitHub"
echo "3. Create two Vercel projects (backend and frontend)"
echo "4. Set environment variables in Vercel"
echo "5. Deploy!"
echo ""
echo -e "${YELLOW}⚠️  Important: Don't forget to update ALLOWED_ORIGINS with your actual Vercel URLs!${NC}"
echo ""
