# Pegasus Desktop

Tauri-based desktop application for Pegasus - AI-Powered Database Management.

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 18+
- Platform-specific requirements:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2
  - **Linux**: `webkit2gtk`, `libappindicator3`

## Development

```bash
# From project root
cd apps/desktop

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev
```

## Building

```bash
# Build for production
npm run tauri:build

# Output will be in src-tauri/target/release/bundle/
```

## Architecture

This app uses the existing Vue frontend from `apps/ui/` and adds:
- Rust-powered database adapters (coming soon)
- Native file dialogs
- Secure file access
- Offline capabilities
