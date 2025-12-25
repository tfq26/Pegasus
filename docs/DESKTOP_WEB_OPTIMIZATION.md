# Desktop vs Web Build Optimization Guide

## Current Issue
The web build includes Tauri dependencies (`@tauri-apps/*`) even though they're only used in the desktop app. This adds ~500KB+ to the bundle.

## Solution: Conditional Imports & Tree Shaking

### Step 1: Update vite.config.js

Add configuration to externalize Tauri in web builds:

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // ... existing config ...
  
  define: {
    // Mark as web build (not desktop)
    __TAURI__: false,
  },
  
  build: {
    // ... existing build config ...
    rollupOptions: {
      // Externalize Tauri deps for web builds
      external: (id) => {
        // If building for web, exclude Tauri
        if (process.env.BUILD_TARGET === 'web') {
          return id.startsWith('@tauri-apps/')
        }
        return false
      },
      output: {
        // ... existing output config ...
      }
    }
  }
})
```

### Step 2: Update package.json Scripts

Differentiate between web and desktop builds:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:desktop": "BUILD_TARGET=desktop vite --port 1420",
    "build": "BUILD_TARGET=web vite build",
    "build:desktop": "BUILD_TARGET=desktop vite build",
    "preview": "vite preview"
  }
}
```

### Step 3: Update Desktop tauri.conf.json

Change the build commands to use desktop-specific scripts:

```json
{
  "build": {
    "beforeDevCommand": "cd ../../apps/ui && npm run dev:desktop",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "cd ../../apps/ui && npm run build:desktop",
    "frontendDist": "../../apps/ui/dist"
  }
}
```

### Step 4: Use Dynamic Imports for Tauri

Update composables to lazy-load Tauri when needed:

**Before:**
```javascript
import { invoke } from '@tauri-apps/api/core'

export const useDesktopAuth = () => {
  // ...
}
```

**After:**
```javascript
export const useDesktopAuth = () => {
  const invoke = async (...args) => {
    if (!('__TAURI_INTERNALS__' in window)) {
      throw new Error('Not running in Tauri')
    }
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke(...args)
  }
  // ...
}
```

### Step 5: Move Tauri Dependencies to Optional

In package.json, move Tauri deps to `peerDependencies` or use a separate package:

```json
{
  "dependencies": {
    // Remove these from main deps
  },
  "peerDependencies": {
    "@tauri-apps/api": "^2.9.1",
    "@tauri-apps/plugin-shell": "^2.3.3",
    "@tauri-apps/plugin-store": "^2.4.1",
    "@tauri-apps/plugin-window": "^2.0.0-alpha.1"
  }
}
```

## Expected Results

### Before Optimization
- Web build size: ~3.8MB (with Tauri deps)
- Desktop build size: 6.9GB (Rust + Web)

### After Optimization
- Web build size: ~3.2MB (-600KB, ~16% reduction)
- Desktop build size: 6.9GB (unchanged)
- No code duplication
- Same codebase for both platforms

## Alternative: Full Separation (Not Recommended)

If you still want to fully separate:

### Structure
```
Pegasus/
├── Pegasus-Desktop/          # Tauri app
│   ├── src-tauri/            # Rust backend
│   └── ui/                   # Desktop-specific UI
└── Pegasus-Web/              # Web app (current apps/ui)
    └── src/                  # Web-only UI
```

### Shared Code Strategy
```
Pegasus/
├── packages/
│   └── shared-ui/            # Shared components
│       ├── components/
│       ├── composables/
│       └── utils/
├── Pegasus-Desktop/
│   └── (imports from shared-ui)
└── Pegasus-Web/
    └── (imports from shared-ui)
```

## Recommendation

**Stick with Option 1**: Optimize the current monorepo structure. It gives you:
- ✅ Best of both worlds
- ✅ Minimal effort
- ✅ Maintainability
- ✅ Code reuse
- ✅ Feature parity

The build size difference (600KB) is minimal compared to the maintenance overhead of full separation.
