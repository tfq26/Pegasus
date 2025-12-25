# Pegasus Desktop App - Implementation Plan

> **Status**: Draft - Pending Review  
> **Target**: Tauri 2.x with Vue 3 frontend, Rust backend core  
> **Goal**: High-performance, secure, native-feeling desktop application

---

## Executive Summary

Build a desktop version of Pegasus using **Tauri** that reuses the existing Vue 3 frontend while adding Rust-powered performance for database operations, file parsing, and local AI inference.

### Core Principles
1. **Performance First** - Heavy operations in Rust, instant UI feedback
2. **Security by Design** - Scoped file access, no silent data collection
3. **Single Codebase** - Share 90%+ of Vue code with web
4. **Native Feel** - Use system dialogs, respect OS conventions

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Pegasus Desktop (Tauri)                   │
├──────────────────────────────────────────────────────────────┤
│  FRONTEND: Vue 3 + Vite                                      │
│  ├── Shared components (existing UI)                         │
│  ├── Platform detection (web vs desktop styling)             │
│  ├── Tauri API calls via @tauri-apps/api                     │
│  └── Offline-capable with local-first data                   │
├──────────────────────────────────────────────────────────────┤
│  RUST CORE: Tauri Commands                                   │
│  ├── Database Adapters                                       │
│  │   ├── SQLite (native, embedded)                           │
│  │   ├── PostgreSQL (via tokio-postgres)                     │
│  │   ├── MySQL (via sqlx)                                    │
│  │   └── SurrealDB (via surrealdb crate)                     │
│  ├── File Operations                                         │
│  │   ├── Excel parsing (calamine crate - 10x faster than JS) │
│  │   ├── CSV streaming (csv crate)                           │
│  │   └── Secure file access (scoped to user-granted paths)   │
│  ├── Local AI (optional)                                     │
│  │   └── llama.cpp bindings for offline inference            │
│  └── Sync Engine                                             │
│      └── Background sync with cloud backend                  │
├──────────────────────────────────────────────────────────────┤
│  CLOUD: Existing Hono Backend                                │
│  ├── User auth (WorkOS)                                      │
│  ├── AI proxy (Gemini API)                                   │
│  ├── Settings/dashboards sync                                │
│  └── Collaboration features                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
apps/
├── ui/                    # Existing Vue frontend (shared)
├── backend/               # Existing Hono backend (cloud)
└── desktop/               # NEW: Tauri app
    ├── src-tauri/
    │   ├── src/
    │   │   ├── main.rs           # Entry point
    │   │   ├── commands/         # Rust commands exposed to JS
    │   │   │   ├── database.rs   # DB adapter commands
    │   │   │   ├── files.rs      # File operations
    │   │   │   └── ai.rs         # Local AI inference
    │   │   ├── adapters/         # Database implementations
    │   │   └── lib.rs
    │   ├── capabilities/         # Permission declarations
    │   ├── Cargo.toml
    │   └── tauri.conf.json
    ├── src/                      # Desktop-specific Vue overrides
    │   └── platform/             # Platform detection utils
    └── package.json
```

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Project Setup
- [ ] Initialize Tauri 2.x project in `apps/desktop`
- [ ] Configure to build from `apps/ui` source
- [ ] Set up development workflow (hot reload)
- [ ] Create platform detection utility

### 1.2 Basic Shell
- [ ] App window with existing Vue UI
- [ ] Native menu bar (File, Edit, View, Help)
- [ ] System tray icon (optional)
- [ ] Window state persistence (size, position)

### 1.3 Auto-Updates
- [ ] Configure Tauri updater
- [ ] Set up update server endpoint

---

## Phase 2: Performance Layer (Week 3-4)

### 2.1 Database Adapters in Rust
- [ ] SQLite adapter (embedded, no server needed)
- [ ] PostgreSQL adapter (tokio-postgres)
- [ ] MySQL adapter (sqlx)
- [ ] SurrealDB adapter (native crate)

### 2.2 File Parsing
- [ ] Excel parsing with `calamine` (10x faster than ExcelJS)
- [ ] CSV streaming with `csv` crate
- [ ] Large file handling without memory spikes

### 2.3 Performance Optimization
- [ ] Move query execution to Rust
- [ ] Implement connection pooling
- [ ] Add query result caching

---

## Phase 3: Security & Permissions (Week 5)

### 3.1 File Access Scoping
```json
// tauri.conf.json capabilities
{
  "security": {
    "csp": "default-src 'self'; connect-src 'self' https://api.pegasus.app",
    "capabilities": {
      "fs": {
        "scope": ["$APP/**", "$DOCUMENT/**"],
        "deny": ["$HOME/.ssh/**", "$HOME/.aws/**"]
      }
    }
  }
}
```

### 3.2 Secure Storage
- [ ] Use Tauri's secure store for credentials
- [ ] Encrypt connection strings at rest
- [ ] API keys stored in OS keychain

### 3.3 AI File Access
- [ ] Explicit user grant required for AI file access
- [ ] Visual indicator when AI is accessing files
- [ ] Audit log of AI file operations

---

## Phase 4: Native Integration (Week 6)

### 4.1 Native Dialogs
- [ ] File open/save dialogs (Tauri native)
- [ ] Confirmation dialogs for destructive actions
- [ ] Error/warning notifications (OS native)

### 4.2 OS Integration
- [ ] Deep links (pegasus://open?connection=...)
- [ ] File associations (.pegasus files)
- [ ] Drag and drop files into app

### 4.3 Platform-Specific Polish
- [ ] macOS: Vibrancy effects, rounded corners
- [ ] Windows: Acrylic backgrounds, sharp corners
- [ ] Keyboard shortcuts matching OS conventions

---

## Phase 5: Sync & Offline (Week 7-8)

### 5.1 Local-First Architecture
- [ ] SQLite for local app state
- [ ] Queue changes when offline
- [ ] Sync on reconnection

### 5.2 Conflict Resolution
- [ ] Last-write-wins for settings
- [ ] Merge strategy for dashboards
- [ ] User prompt for conflicts

### 5.3 Background Sync
- [ ] Periodic sync in background
- [ ] Real-time sync via WebSocket (when online)

---

## Technology Decisions

### Why Tauri over Electron?
| Aspect | Tauri | Electron |
|--------|-------|----------|
| Bundle size | ~10 MB | ~150 MB |
| Memory usage | ~50 MB | ~200 MB+ |
| Startup time | < 1s | 2-5s |
| Security | Rust + scoped permissions | Node.js (more attack surface) |
| Native feel | System webview | Chromium |

### Why Rust for Performance?
| Operation | JavaScript (current) | Rust |
|-----------|---------------------|------|
| Excel parse (10K rows) | ~2000ms | ~200ms |
| SQLite query | IPC overhead | Native |
| CSV streaming | Memory spikes | Constant memory |

### Native Components Strategy
- **Use native**: File dialogs, system notifications, menus
- **Use web with native styling**: Buttons, dropdowns, tables
- **Reason**: Consistency > pixel-perfect native (users accept this: Discord, VS Code, Slack)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rust learning curve | Start with Tauri's examples; AI-assisted Rust development |
| WebView inconsistency | Test on all platforms; use feature detection |
| Bundle size creep | Tree-shake aggressively; lazy load features |
| Update failures | Rollback mechanism; manual download fallback |

---

## Success Metrics

- [ ] Cold start < 2 seconds
- [ ] Query execution 5x faster than web
- [ ] Memory usage < 150 MB idle
- [ ] Bundle size < 50 MB
- [ ] 95%+ code reuse from web app

---

## Next Steps

1. **Review this plan** - Adjust scope based on priorities
2. **Set up skeleton** - Tauri project with basic Vue shell
3. **Migrate one feature** - Start with Excel parsing in Rust
4. **Iterate** - Add features incrementally, test on all platforms
