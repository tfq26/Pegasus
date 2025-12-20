# Dashboard Creation Fix - Deployment Issue Resolved

## Problem
Dashboard creation was returning **401 Unauthorized** errors on the deployed site, while working fine locally.

## Root Cause
The issue was caused by **cross-origin cookie restrictions**. The backend was setting cookies with `sameSite: "Lax"`, which prevents cookies from being sent in cross-origin API requests (like from your deployed frontend to your deployed backend).

While the auth system was already designed to handle this by:
1. Including the token in the URL after OAuth redirect
2. Storing the token in localStorage
3. Sending it via Authorization header in `/auth/me` requests

The dashboard API endpoints were **only** checking for cookies, not the Authorization header.

## Solution Implemented

### Backend Changes (`apps/backend/src/routes/dashboard.js`)

1. **Added `getToken` helper function** to extract tokens from both cookies AND Authorization headers:
```javascript
const getToken = (c) => {
    // Try cookie first (desktop/same-domain)
    let token = getCookie(c, "session")
    
    // Fallback to Authorization header (mobile/cross-domain)
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    
    return token
}
```

2. **Updated all dashboard endpoints** to use `getToken(c)` instead of `getCookie(c, "session")`
   - This includes: GET/POST/PUT/DELETE for dashboards, permissions, sharing, etc.

### Frontend Changes (`apps/ui/src/lib/api.ts`)

1. **Added `getAuthHeaders` helper function** to include Authorization header from localStorage:
```typescript
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }
  
  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  return headers
}
```

2. **Updated all dashboard API functions** to use `getAuthHeaders()`:
   - `createDashboard`
   - `fetchDashboards`
   - `fetchDashboard`
   - `updateDashboard`
   - `deleteDashboard`
   - `shareDashboard`
   - `fetchSharedDashboards`
   - `updateDashboardPrivacy`
   - `inviteUserToDashboard`
   - `fetchDashboardPermissions`
   - `removeDashboardPermission`
   - `searchUsers`

## How It Works Now

1. **User logs in** → OAuth redirect includes token in URL
2. **Frontend** → Stores token in `localStorage` (via `useAuth` composable)
3. **API calls** → Include `Authorization: Bearer <token>` header
4. **Backend** → Checks both cookie AND Authorization header
5. **Success** → Works on both local and deployed environments!

## Testing

To test the fix:

1. **Deploy the changes** to your production environment
2. **Log in** to your deployed site
3. **Try creating a dashboard** - it should now work!
4. **Check browser DevTools** → Network tab → POST /dashboards request should include Authorization header

## Additional Benefits

This fix also improves:
- **Mobile compatibility** - Works better on mobile browsers that block third-party cookies
- **Cross-domain deployments** - Frontend and backend can be on different domains
- **Security** - Token-based auth is more flexible than cookie-only auth

## Files Modified

- `/apps/backend/src/routes/dashboard.js` - Added getToken helper, updated all endpoints
- `/apps/ui/src/lib/api.ts` - Added getAuthHeaders helper, updated all dashboard API calls

## No Breaking Changes

This is a **backward-compatible** change:
- ✅ Still works with cookies (local development)
- ✅ Now also works with Authorization headers (production/cross-origin)
- ✅ No changes needed to environment variables
- ✅ No database migrations required
