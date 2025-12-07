---
description: Complete Experimental Features System Implementation Plan
---

# Experimental Features System - Implementation Status

## 🎯 Objective
Create a comprehensive experimental features system that allows users to request access to experimental features (like manual Excel formulas) through the Support page, get approved by admins, and enable/disable features in Settings. Integrate with WorkOS-style feature flags.

## ✅ Completed Work

### 1. Support Page UI (`apps/ui/src/views/Support.vue`)
- ✅ Added "Experimental Features" section with Beaker icon
- ✅ Status display showing:
  - No access (can request)
  - Request pending (awaiting approval)
  - Access granted (can enable in settings)
- ✅ Request form with:
  - Reason textarea (min 20 chars, max 500)
  - Optional email for updates
  - Terms agreement checkbox
- ✅ API integration for checking status and submitting requests
- ✅ Icons imported: `Beaker`, `Clock` from lucide-vue-next

### 2. Backend Module (`apps/backend/experimental-features.js`)
- ✅ Created comprehensive module with:
  - Database schema definitions
  - Feature definitions (EXPERIMENTAL_FEATURES object)
  - Helper functions for all operations
- ✅ Features defined:
  - `manual-excel-formulas` - Manual Excel formula entry
  - `advanced-ai-modes` - Experimental AI features
  - `query-performance-insights` - Query execution insights

### 3. Backend Integration (`apps/backend/index.js`)
- ✅ Imported experimental features module
- ⚠️ **ISSUE**: `/auth/me` endpoint has unreachable code (lines 433-441)
- ❌ API endpoints not yet added

### 4. Other Improvements
- ✅ Updated AI formula prompt with comprehensive Excel function list
- ✅ Added rounding functions (ROUNDUP, ROUNDDOWN, CEILING, FLOOR, etc.)
- ✅ Implemented query cancellation feature with AbortController
- ✅ Fixed query tab isolation (SSMS-style)

## 🚧 Remaining Work

### Phase 1: Fix Backend Issues

#### 1.1 Fix `/auth/me` Endpoint
**File**: `apps/backend/index.js` (lines 422-445)

**Current Code** (BROKEN):
```javascript
app.get("/auth/me", async (c) => {
  const token = getCookie(c, "session")
  if (!token) {
    return c.json({ user: null })
  }
  try {
    const payload = await verify(token, jwtSecret)
    return c.json({ user: payload })  // ← Returns here
    
    // UNREACHABLE CODE:
    const featureFlags = await getUserFeatureFlags(db, payload.sub)
    return c.json({ 
      user: {
        ...payload,
        featureFlags
      }
    })
  } catch (error) {
    return c.json({ error: "Invalid token" }, 401)
  }
})
```

**Fix Required**:
```javascript
app.get("/auth/me", async (c) => {
  const token = getCookie(c, "session")
  if (!token) {
    return c.json({ user: null })
  }
  try {
    const payload = await verify(token, jwtSecret)
    
    // Get user's feature flags
    const featureFlags = await getUserFeatureFlags(db, payload.sub)
    
    return c.json({ 
      user: {
        ...payload,
        featureFlags // WorkOS-style feature flags array
      }
    })
  } catch (error) {
    return c.json({ error: "Invalid token" }, 401)
  }
})
```

#### 1.2 Add Experimental Features API Endpoints
**File**: `apps/backend/index.js` (insert after `/auth/me`, around line 445)

**Endpoints to Add**:
```javascript
// ==================== EXPERIMENTAL FEATURES API ====================

// Get experimental status for current user
app.get("/api/experimental/status", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)
    return c.json(status)
  } catch (error) {
    console.error("Error getting experimental status:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Request experimental access
app.post("/api/experimental/request", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const { reason, email } = await c.req.json()

    if (!reason || reason.trim().length < 20) {
      return c.json({ error: "Reason must be at least 20 characters" }, 400)
    }

    const result = await createExperimentalRequest(db, payload.sub, reason, email)
    return c.json(result)
  } catch (error) {
    console.error("Error creating experimental request:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Get available experimental features
app.get("/api/experimental/features", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)

    if (!status.hasAccess) {
      return c.json({ error: "No experimental access" }, 403)
    }

    const enabledFeatures = await getUserFeatureFlags(db, payload.sub)
    const features = Object.values(EXPERIMENTAL_FEATURES).map(feature => ({
      ...feature,
      enabled: enabledFeatures.includes(feature.id)
    }))

    return c.json({ features })
  } catch (error) {
    console.error("Error getting experimental features:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Toggle a feature flag
app.post("/api/experimental/features/:featureId/toggle", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)

    if (!status.hasAccess) {
      return c.json({ error: "No experimental access" }, 403)
    }

    const { featureId } = c.req.param()
    const { enabled } = await c.req.json()

    const featureExists = Object.values(EXPERIMENTAL_FEATURES).some(f => f.id === featureId)
    if (!featureExists) {
      return c.json({ error: "Invalid feature ID" }, 400)
    }

    const result = await toggleUserFeature(db, payload.sub, featureId, enabled)
    return c.json(result)
  } catch (error) {
    console.error("Error toggling feature:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Admin: Grant experimental access
app.post("/api/experimental/admin/grant", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const adminPayload = await verify(token, jwtSecret)
    // TODO: Add admin role check here
    
    const { userId } = await c.req.json()
    const result = await grantExperimentalAccess(db, userId, adminPayload.sub)
    return c.json(result)
  } catch (error) {
    console.error("Error granting experimental access:", error)
    return c.json({ error: error.message }, 500)
  }
})
```

#### 1.3 Initialize Database Tables
**File**: `apps/backend/index.js` (around line 2250, before `initializeWeeklyDigest`)

**Add**:
```javascript
// Initialize experimental features tables
try {
  await initExperimentalTables(db)
} catch (error) {
  console.error('Failed to initialize experimental tables:', error)
}
```

### Phase 2: Frontend Composable

#### 2.1 Create Feature Flags Composable
**File**: `apps/ui/src/composables/useFeatureFlags.ts` (NEW FILE)

```typescript
import { ref, computed } from 'vue'

interface User {
  sub: string
  email: string
  featureFlags?: string[]
}

const currentUser = ref<User | null>(null)

export function useFeatureFlags() {
  const featureFlags = computed(() => currentUser.value?.featureFlags || [])
  
  const hasFeature = (featureId: string) => {
    return featureFlags.value.includes(featureId)
  }
  
  const setUser = (user: User | null) => {
    currentUser.value = user
  }
  
  // Feature-specific helpers
  const hasManualFormulas = computed(() => hasFeature('manual-excel-formulas'))
  const hasAdvancedAI = computed(() => hasFeature('advanced-ai-modes'))
  const hasQueryInsights = computed(() => hasFeature('query-performance-insights'))
  
  return {
    featureFlags,
    hasFeature,
    setUser,
    hasManualFormulas,
    hasAdvancedAI,
    hasQueryInsights
  }
}
```

#### 2.2 Update Auth Loading
**File**: `apps/ui/src/App.vue` or wherever auth is loaded

**Add**:
```typescript
import { useFeatureFlags } from '@/composables/useFeatureFlags'

const { setUser } = useFeatureFlags()

// When loading user
const loadUser = async () => {
  const response = await fetch('/auth/me', { credentials: 'include' })
  const data = await response.json()
  setUser(data.user) // This will include featureFlags
}
```

### Phase 3: Settings Tab

#### 3.1 Create Experimental Settings Tab
**File**: `apps/ui/src/views/settings/ExperimentalSettings.vue` (NEW FILE)

**Template**:
```vue
<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-foreground mb-2">Experimental Features</h2>
      <p class="text-muted-foreground">
        Enable or disable experimental features. These features may be unstable or change without notice.
      </p>
    </div>

    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
    </div>

    <div v-else-if="!hasAccess" class="p-6 rounded-lg border border-border bg-muted/50">
      <p class="text-muted-foreground">
        You don't have access to experimental features yet. 
        <router-link to="/support" class="text-primary hover:underline">Request access</router-link>
      </p>
    </div>

    <div v-else class="space-y-4">
      <div v-for="feature in features" :key="feature.id" 
           class="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold text-foreground">{{ feature.name }}</h3>
              <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Experimental
              </span>
            </div>
            <p class="text-sm text-muted-foreground">{{ feature.description }}</p>
          </div>
          <Switch 
            :checked="feature.enabled" 
            @update:checked="toggleFeature(feature.id, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Switch } from '@/components/ui/switch'
import { toast } from 'vue-sonner'

const features = ref([])
const loading = ref(true)
const hasAccess = ref(false)

const loadFeatures = async () => {
  try {
    const response = await fetch('/api/experimental/features', {
      credentials: 'include'
    })
    
    if (response.status === 403) {
      hasAccess.value = false
      return
    }
    
    const data = await response.json()
    features.value = data.features
    hasAccess.value = true
  } catch (error) {
    console.error('Failed to load experimental features:', error)
    toast.error('Failed to load experimental features')
  } finally {
    loading.value = false
  }
}

const toggleFeature = async (featureId: string, enabled: boolean) => {
  try {
    const response = await fetch(`/api/experimental/features/${featureId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled })
    })
    
    if (!response.ok) throw new Error('Failed to toggle feature')
    
    toast.success(enabled ? 'Feature enabled' : 'Feature disabled')
    
    // Reload user to update feature flags
    window.location.reload() // Or emit event to reload user
  } catch (error) {
    console.error('Failed to toggle feature:', error)
    toast.error('Failed to toggle feature')
    await loadFeatures() // Reload to reset UI
  }
}

onMounted(loadFeatures)
</script>
```

#### 3.2 Add Tab to Settings
**File**: `apps/ui/src/views/Settings.vue`

**Add** "Experimental" tab to the tabs array (only show if user has access)

### Phase 4: Wrap Excel Features

#### 4.1 Update Grid.vue
**File**: `apps/ui/src/components/TableView/Grid/Grid.vue`

**Wrap formula features**:
```vue
<script setup>
import { useFeatureFlags } from '@/composables/useFeatureFlags'

const { hasManualFormulas } = useFeatureFlags()

// Only show formula autocomplete if feature is enabled
const showFormulaFeatures = computed(() => {
  return props.aiMode || hasManualFormulas.value
})
</script>

<template>
  <!-- Formula autocomplete suggestions -->
  <div v-if="showFormulaFeatures && showSuggestions" ...>
    <!-- autocomplete UI -->
  </div>
</template>
```

## 📋 Testing Checklist

Once implementation is complete:

- [ ] User can request experimental access from Support page
- [ ] Request is saved to database
- [ ] Status shows "pending" after request
- [ ] Admin can grant access (manual DB update for now)
- [ ] User sees "Experimental" tab in Settings after access granted
- [ ] User can toggle features on/off
- [ ] Feature flags appear in `/auth/me` response
- [ ] Excel formula features only show when enabled
- [ ] Page reload preserves feature flag state

## 🔧 Quick Admin Commands

Grant experimental access manually (until admin UI is built):

```sql
-- Grant access to a user
INSERT INTO experimental_access (user_id, has_access, granted_at, granted_by)
VALUES ('user_id_here', 1, strftime('%s', 'now') * 1000, 'admin_id')
ON CONFLICT(user_id) DO UPDATE SET has_access = 1;

-- Enable a feature for a user
INSERT INTO user_feature_flags (user_id, feature_id, enabled, enabled_at)
VALUES ('user_id_here', 'manual-excel-formulas', 1, strftime('%s', 'now') * 1000)
ON CONFLICT(user_id, feature_id) DO UPDATE SET enabled = 1;
```

## 📝 Notes

- WorkOS integration is ready - just need to populate `featureFlags` array in session
- Database tables will be created automatically on server start
- Feature flags are user-specific and persistent
- System is designed to scale to many experimental features
- Admin UI for approving requests can be added later

---

**Status**: Ready for Phase 1 implementation
**Last Updated**: 2025-12-07
