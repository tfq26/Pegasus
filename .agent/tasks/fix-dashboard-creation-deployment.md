# Fix Dashboard Creation on Deployed Site

## Problem
Dashboard creation works locally but fails on the deployed site.

## Root Causes

### 1. CORS Configuration
The backend needs to allow requests from the deployed frontend URL.

**Backend Location**: `apps/backend/index.js` (lines 10-36)

Current configuration:
```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["http://localhost:5173", "http://127.0.0.1:5173"]
```

**Fix**: Ensure `ALLOWED_ORIGINS` environment variable includes your deployed frontend URL.

### 2. Cookie/Credentials Configuration
The frontend API calls use `credentials: 'include'` which requires:
- Backend CORS to have `credentials: true` ✅ (already set)
- Frontend and backend to be on same domain OR backend to explicitly allow the origin
- Cookies to have proper `SameSite` and `Secure` attributes in production

**Backend Location**: `apps/backend/src/routes/auth.js`

### 3. API URL Configuration
The frontend needs to know the correct backend URL in production.

**Frontend Location**: `apps/ui/src/lib/api.ts` (lines 4-11)

Current configuration:
```typescript
const DEFAULT_QUERY_API_URL = 'http://localhost:3000'

const derivedApiUrl = import.meta.env.VITE_QUERY_API_URL ||
  (typeof window !== 'undefined'
    ? (window as Window & { __QUERY_API_URL__?: string }).__QUERY_API_URL__
    : undefined) || DEFAULT_QUERY_API_URL

export const QUERY_API_URL = derivedApiUrl
```

## Solution Steps

### Step 1: Check Environment Variables

**For Backend** (deployed environment):
- `ALLOWED_ORIGINS` - Should include your deployed frontend URL (e.g., `https://your-app.vercel.app`)
- `JWT_SECRET` - Should be set to a secure value
- `WORKOS_API_KEY` - Should be set
- `WORKOS_REDIRECT_URI` - Should point to your deployed backend callback URL

**For Frontend** (deployed environment):
- `VITE_QUERY_API_URL` - Should point to your deployed backend URL (e.g., `https://your-api.railway.app`)

### Step 2: Update Cookie Settings for Production

The session cookie needs to be configured properly for cross-origin requests in production.

**File**: `apps/backend/src/routes/auth.js`

Look for where cookies are set (setCookie calls) and ensure they have:
```javascript
setCookie(c, "session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-origin in production
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/'
})
```

### Step 3: Verify Dashboard Creation Endpoint

The endpoint is at `POST /dashboards` in `apps/backend/src/routes/dashboard.js` (lines 239-309).

It requires:
1. Valid session cookie
2. JWT verification
3. User to exist in database (handled by `upsertUser`)

### Step 4: Add Debug Logging

Add console logs to track the issue:

**Frontend** (`apps/ui/src/stores/dashboard.ts`):
```typescript
const createNewDashboard = async (title: string) => {
    console.log('[Dashboard Store] Creating dashboard:', title)
    console.log('[Dashboard Store] API URL:', QUERY_API_URL)
    isLoading.value = true
    error.value = null
    try {
        const { id } = await createDashboard(title, { layout: [], elements: [] })
        console.log('[Dashboard Store] Dashboard created:', id)
        await loadDashboards()
        await selectDashboard(id)
        return id
    } catch (e: any) {
        console.error('[Dashboard Store] Error:', e)
        error.value = e.message
        throw e
    } finally {
        isLoading.value = false
    }
}
```

**Frontend** (`apps/ui/src/lib/api.ts`):
```typescript
export async function createDashboard(title: string, data: any) {
  console.log('[API] Creating dashboard:', { title, url: QUERY_API_URL })
  const response = await fetch(`${QUERY_API_URL}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title, data })
  })
  console.log('[API] Response status:', response.status)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    console.error('[API] Error response:', error)
    throw new Error(error.error || 'Failed to create dashboard')
  }
  return await response.json()
}
```

### Step 5: Common Deployment Issues Checklist

- [ ] Backend `ALLOWED_ORIGINS` includes deployed frontend URL
- [ ] Frontend `VITE_QUERY_API_URL` points to deployed backend
- [ ] Backend is accessible from the internet
- [ ] Session cookies are being sent (check Network tab in browser DevTools)
- [ ] JWT_SECRET is the same value in both environments
- [ ] WORKOS credentials are correct for production
- [ ] Database (SurrealDB) is accessible from deployed backend

## Testing

1. Open browser DevTools → Network tab
2. Try to create a dashboard
3. Look for the POST request to `/dashboards`
4. Check:
   - Request URL (should point to production backend)
   - Request Headers (should include Cookie)
   - Response status and body

## Quick Fix Commands

If you need to check/set environment variables:

**Vercel (Frontend)**:
```bash
vercel env ls
vercel env add VITE_QUERY_API_URL
```

**Railway/Render (Backend)**:
```bash
# Check current environment
railway variables

# Add variable
railway variables set ALLOWED_ORIGINS=https://your-frontend.vercel.app
```
