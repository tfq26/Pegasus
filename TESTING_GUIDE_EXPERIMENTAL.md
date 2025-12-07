# Quick Testing Guide - Experimental Features

## Prerequisites
- Backend server running on http://localhost:3000
- Frontend running on http://localhost:5173
- User logged in with WorkOS authentication

## Test Flow

### 1. Check Initial State (No Access)

#### Test Support Page
1. Navigate to `/support`
2. Scroll to "Experimental Features" section
3. **Expected**: Should show "Request Access" button
4. **Status**: "You don't have access to experimental features yet"

#### Test Settings Page
1. Navigate to `/settings`
2. Click on "Experimental" tab
3. **Expected**: Message saying "You don't have access to experimental features yet"
4. **Expected**: Link to Support page to request access

#### Test Excel Grid
1. Navigate to a workspace with data
2. Try to enter a formula (start with `=`)
3. **Expected**: No autocomplete suggestions appear (unless in AI mode)

---

### 2. Request Experimental Access

1. Go to `/support`
2. Find "Experimental Features" section
3. Click "Request Access" button
4. Fill in the form:
   - **Reason**: Enter at least 20 characters (e.g., "I want to test manual Excel formulas for my data analysis workflow")
   - **Email** (optional): Enter email for updates
   - **Terms**: Check the agreement checkbox
5. Click "Submit Request"
6. **Expected**: Success toast notification
7. **Expected**: Status changes to "Request Pending"
8. **Expected**: Shows "Awaiting approval" message with timestamp

---

### 3. Grant Access (Admin Action)

Since there's no admin UI yet, use SQL commands:

#### Option A: Using Turso CLI
```bash
turso db shell pegasusdb-taufeeq26
```

#### Option B: Using SQL directly
```sql
-- Get your user ID first
SELECT id, email FROM users WHERE email = 'your-email@example.com';

-- Grant experimental access (replace USER_ID)
INSERT INTO experimental_access (user_id, has_access, granted_at, granted_by)
VALUES ('USER_ID', 1, strftime('%s', 'now') * 1000, 'admin')
ON CONFLICT(user_id) DO UPDATE SET has_access = 1;

-- Enable manual formulas feature (replace USER_ID)
INSERT INTO user_feature_flags (user_id, feature_id, enabled, enabled_at)
VALUES ('USER_ID', 'manual-excel-formulas', 1, strftime('%s', 'now') * 1000)
ON CONFLICT(user_id, feature_id) DO UPDATE SET enabled = 1;
```

---

### 4. Verify Access Granted

#### Reload the App
1. Refresh the browser (to reload user data with feature flags)
2. Or log out and log back in

#### Test Support Page
1. Navigate to `/support`
2. **Expected**: Status shows "Access Granted"
3. **Expected**: Message says "You have access to experimental features! Enable them in Settings."
4. **Expected**: Link to Settings page

#### Test Settings Page
1. Navigate to `/settings`
2. Click on "Experimental" tab
3. **Expected**: See list of experimental features:
   - Manual Excel Formulas
   - Advanced AI Modes
   - Query Performance Insights
4. **Expected**: Each feature has a toggle switch
5. **Expected**: "Manual Excel Formulas" should be ON (enabled)
6. **Expected**: Other features should be OFF

---

### 5. Test Feature Toggle

1. In Settings > Experimental tab
2. Toggle "Manual Excel Formulas" OFF
3. **Expected**: Toast notification "Feature disabled"
4. **Expected**: Page reloads
5. Toggle it back ON
6. **Expected**: Toast notification "Feature enabled"
7. **Expected**: Page reloads

---

### 6. Test Manual Formula Features

#### Test Autocomplete
1. Navigate to a workspace with data
2. Click on a cell
3. Type `=` in the formula bar
4. Start typing a function name (e.g., `SU`)
5. **Expected**: Autocomplete dropdown appears
6. **Expected**: Shows matching functions (SUM, SUMIF, etc.)
7. Use arrow keys to navigate suggestions
8. Press Tab or Enter to insert suggestion
9. **Expected**: Function name inserted with opening parenthesis

#### Test Formula Entry
1. Enter a complete formula (e.g., `=SUM(A1:A10)`)
2. Press Enter
3. **Expected**: Formula calculates correctly
4. **Expected**: Result shows in cell

#### Test Point Mode
1. Start typing a formula: `=SUM(`
2. Click on cells to select them
3. **Expected**: Cell references added to formula
4. **Expected**: Selected cells highlighted with colored rings

---

### 7. Test Feature Flag Persistence

1. Toggle a feature ON in Settings
2. Close the browser tab
3. Open a new tab and navigate to the app
4. Log in (if needed)
5. Go to Settings > Experimental
6. **Expected**: Feature is still ON
7. **Expected**: Feature flags persist across sessions

---

### 8. Test Without Access

1. Use SQL to revoke access:
```sql
UPDATE experimental_access SET has_access = 0 WHERE user_id = 'USER_ID';
```
2. Refresh the app
3. **Expected**: Experimental tab shows "no access" message
4. **Expected**: Manual formula features don't work
5. **Expected**: Support page shows "Request Access" again

---

## API Endpoint Tests

### Test with curl

#### Check Status
```bash
curl -X GET http://localhost:3000/api/experimental/status \
  --cookie "session=YOUR_SESSION_TOKEN"
```

#### Request Access
```bash
curl -X POST http://localhost:3000/api/experimental/request \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_TOKEN" \
  -d '{
    "reason": "I want to test experimental features for development",
    "email": "test@example.com"
  }'
```

#### Get Features List
```bash
curl -X GET http://localhost:3000/api/experimental/features \
  --cookie "session=YOUR_SESSION_TOKEN"
```

#### Toggle Feature
```bash
curl -X POST http://localhost:3000/api/experimental/features/manual-excel-formulas/toggle \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_TOKEN" \
  -d '{"enabled": true}'
```

---

## Expected Database State

### After Request
```sql
SELECT * FROM experimental_requests WHERE user_id = 'USER_ID';
-- Should show: status='pending', reason, requested_at
```

### After Grant
```sql
SELECT * FROM experimental_access WHERE user_id = 'USER_ID';
-- Should show: has_access=1, granted_at, granted_by

SELECT * FROM user_feature_flags WHERE user_id = 'USER_ID';
-- Should show: feature_id='manual-excel-formulas', enabled=1
```

---

## Troubleshooting

### Feature flags not showing
- Check `/auth/me` response includes `featureFlags` array
- Verify user is logged in
- Check browser console for errors
- Refresh the page to reload user data

### Autocomplete not working
- Verify `manual-excel-formulas` is in user's feature flags
- Check that you're not in AI mode (which has different behavior)
- Make sure you're typing in the formula bar, not cell directly
- Start formula with `=` character

### Settings tab not showing features
- Check that user has `has_access=1` in `experimental_access` table
- Verify API endpoint `/api/experimental/features` returns 200 (not 403)
- Check browser network tab for API errors

### Database errors
- Ensure backend server is running
- Check that tables were created (look for "✅ Experimental features tables initialized" in logs)
- Verify Turso connection is working

---

## Success Criteria

✅ All tests pass when:
1. User can request experimental access
2. Admin can grant access via SQL
3. User sees features in Settings after access granted
4. User can toggle features on/off
5. Feature flags persist across sessions
6. Manual formula autocomplete works when feature is enabled
7. Manual formula autocomplete is hidden when feature is disabled
8. Feature flags are included in `/auth/me` response

---

**Testing Date**: 2025-12-07
**System Status**: All phases implemented and ready for testing
