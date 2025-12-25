# Deploying Pegasus Web App to Vercel

## Quick Start

### 1. Install Vercel CLI (if not already installed)
```bash
npm i -g vercel
```

### 2. Clean Build (Important!)
```bash
# From the apps/ui directory
npm run clean
rm -rf dist .vite
npm install
npm run build
```

### 3. Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)
```bash
# From the apps/ui directory
vercel

# For production deployment
vercel --prod
```

#### Option B: Using Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Set the following configuration:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/ui`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

## Environment Variables

Set these in Vercel's project settings:

```env
# Required
NODE_VERSION=22.12.0

# Optional - if you have environment-specific configs
VITE_API_URL=https://your-backend-api.com
```

## Troubleshooting

### Error: "Could not load ... Home.vue"
This is a **caching issue**. Solution:
1. Clear local build artifacts: `npm run clean && rm -rf dist .vite`
2. In Vercel dashboard: Settings → General → Clear Build Cache
3. Redeploy

### Build Fails on Vercel
1. Check Node version matches (20.19.0+ or 22.12.0+)
2. Clear Vercel build cache (Settings → General → Clear Build Cache)
3. Check that all dependencies are in `package.json`
4. Verify no dev-only imports in production code

### 404 on Routes
The `vercel.json` already handles SPA routing. If you still get 404s:
1. Verify `vercel.json` exists in `/apps/ui/`
2. Check the rewrite rules are correct
3. Redeploy after saving changes

## vercel.json Configuration

Your current config (already set up):
```json
{
    "rewrites": [
        {
            "source": "/(.*)",
            "destination": "/index.html"
        }
    ]
}
```

This ensures all routes are handled by Vue Router.

## Post-Deployment Checklist

- [ ] Test all routes work (no 404s)
- [ ] Verify authentication flow works
- [ ] Check API endpoints are accessible
- [ ] Test responsive design on mobile
- [ ] Verify assets load correctly (images, fonts, etc.)
- [ ] Check browser console for errors
- [ ] Test dashboard functionality
- [ ] Verify query interface works

## Continuous Deployment

Once connected to GitHub:
1. Every push to `main` triggers a production deployment
2. Pull requests get preview deployments
3. You can configure deployment branches in Vercel settings

## Custom Domain

To add a custom domain:
1. Go to Project Settings → Domains
2. Add your domain
3. Update DNS records as instructed
4. Wait for SSL certificate (usually < 1 hour)

## Performance Tips

- Your build already uses code splitting
- Assets are hashed for cache busting
- Consider adding `@vercel/analytics` for insights
- Set up ISR for any static content if needed
