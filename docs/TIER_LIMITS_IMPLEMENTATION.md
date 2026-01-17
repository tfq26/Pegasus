# Tier-Based Limits Implementation Summary

## Overview
Implemented comprehensive tier-based restrictions across Free, Pro, and Pro+ subscription plans to differentiate value and encourage upgrades.

## Tier Limits Configuration

### Free Tier
- **Connections**: 4 max
- **Tables**: 20 total (across all connections)
- **Dashboards**: 1 owned (shared dashboards unlimited)
- **AI Models**: `gemini-1.5-flash`, `gpt-4o-mini`
- **Storage**: 100 MB
- **Tokens**: 60,000/month

### Pro Tier
- **Connections**: Unlimited
- **Tables**: Unlimited
- **Dashboards**: 10 owned
- **AI Models**: `gemini-1.5-flash`, `gemini-1.5-pro`, `gpt-4o-mini`, `gpt-4o`, `o1-mini`
- **Storage**: 500 MB
- **Tokens**: 200,000/month

### Pro+ Tier
- **Connections**: Unlimited
- **Tables**: Unlimited
- **Dashboards**: Unlimited
- **AI Models**: All models
- **Storage**: 10 GB
- **Tokens**: 600,000/month
- **Experimental Features**: Automatic access

## Backend Implementation

### 1. Core Module: `/lib/tierLimits.js`
Created centralized tier limits configuration with validation functions:
- `getTierLimits(tier)` - Get limits for a tier
- `canCreateConnection(db, userId, tier)` - Check connection creation permission
- `canCreateDashboard(db, userId, tier)` - Check dashboard creation permission
- `canAddTables(db, userId, tier, newTableCount)` - Check table limit
- `filterModelsByTier(allModels, tier)` - Filter AI models by tier
- `isModelAllowed(modelId, tier)` - Check if specific model is allowed
- `getUserUsageSummary(db, userId, tier)` - Get usage stats for UI

### 2. Enforcement Points

#### Connection Routes (`/src/routes/connection.js`)
- Added tier check before connection creation
- Returns 403 with upgrade message if limit reached
- Response includes: `error`, `limit`, `current`, `tier`, `upgradeRequired`

#### Dashboard Routes (`/src/routes/dashboard.js`)
- Added tier check before dashboard creation
- Returns 403 with upgrade message if limit reached
- Shared dashboards excluded from count

#### Chat Routes (`/src/routes/chat.js`)
- Added model filtering to `/ai/models` endpoint
- Returns only models allowed for user's tier
- Response includes tier information

#### Usage Endpoint (`/usage`)
- Added `tierUsage` object to response containing:
  - `connections`: { current, limit, percentage }
  - `tables`: { current, limit, percentage }
  - `dashboards`: { current, limit, percentage }

### 3. Experimental Features
Updated `/experimental-features.js`:
- Pro+ users automatically get experimental access
- Source tracked as `'tier_pro_plus'`
- No manual request/approval needed

## Frontend Integration Points (To Be Implemented)

### Required UI Components:
1. **Usage Meters** - Show current/limit for connections, tables, dashboards
2. **Upgrade Prompts** - Modal/toast when hitting limits
3. **Model Dropdown** - Filter and badge locked models
4. **Connection Guard** - Pre-check before showing connection form
5. **Dashboard Guard** - Pre-check before creating dashboard
6. **Downgrade Warning** - Banner showing grace period and renewal CTA

### API Response Formats:

#### Limit Reached (403):
```json
{
  "error": "You've reached the free tier limit of 4 connections...",
  "limit": 4,
  "current": 4,
  "tier": "free",
  "upgradeRequired": true
}
```

#### Usage Summary:
```json
{
  "tierUsage": {
    "connections": { "current": 3, "limit": 4, "percentage": 75 },
    "tables": { "current": 18, "limit": 20, "percentage": 90 },
    "dashboards": { "current": 1, "limit": 1, "percentage": 100 }
  }
}
```

#### Models Endpoint:
```json
{
  "models": [...filtered models...],
  "tier": "free"
}
```

## Table Counting Logic
- Tables counted from Explorer sidebar (visible tables under each connection)
- Stored in `connection.tables` field in database
- Counted across ALL user connections
- Free tier: 20 table limit total

## Downgrade Behavior (To Be Implemented)
- Soft lock: Read-only access to excess resources
- Grace period: Until end of current billing period (`current_period_end`)
- UI: Banner showing "Access ends on [date]" + renewal CTA
- After grace period: Hard block on excess resources

## Testing Checklist
- [ ] Free user cannot create 5th connection
- [ ] Free user cannot create 2nd dashboard
- [ ] Free user sees only flash/mini models
- [ ] Pro user sees extended model list
- [ ] Pro+ user sees all models
- [ ] Pro+ user has automatic experimental access
- [ ] Usage meters display correctly
- [ ] Upgrade prompts show at limits
- [ ] Shared dashboards don't count against limit

## Next Steps
1. Frontend usage meter component
2. Upgrade modal/prompt component
3. Model dropdown filtering UI
4. Connection/Dashboard creation guards
5. Downgrade warning banner
6. E2E testing of all limits
