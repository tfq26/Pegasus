#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_ROOT="$SCRIPT_DIR/.."
MARKETING_ROOT="$APP_ROOT/../Pegasus-Marketing"
DESKTOP_APP_DIR="$APP_ROOT/apps/desktop"

echo "🚀 Starting Pegasus Desktop Build & Publish (macOS)..."

# Check if npm run tauri:build exists
if ! grep -q "tauri:build" "$DESKTOP_APP_DIR/package.json"; then
    echo "❌ 'tauri:build' script not found in $DESKTOP_APP_DIR/package.json"
    exit 1
fi

# Build the desktop app
cd "$DESKTOP_APP_DIR"
echo "📦 Building Tauri App..."
# Ensure dependencies are installed if needed, but assuming dev env is ready
npm run tauri:build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Find the dmg
DMG_Path=$(find "$DESKTOP_APP_DIR/src-tauri/target/release/bundle/dmg" -name "*.dmg" | head -n 1)

if [ -z "$DMG_Path" ]; then
    echo "❌ No DMG found in $DESKTOP_APP_DIR/src-tauri/target/release/bundle/dmg!"
    exit 1
fi

echo "✅ Build successful: $DMG_Path"

# Ensure destination exists
DEST_DIR="$MARKETING_ROOT/public/releases"
if [ ! -d "$DEST_DIR" ]; then
    echo "📂 Creating releases directory: $DEST_DIR"
    mkdir -p "$DEST_DIR"
fi

# Copy and rename
echo "🚚 Copying to marketing site..."
cp "$DMG_Path" "$DEST_DIR/pegasus-desktop-mac.dmg"

echo "🎉 Published to $DEST_DIR/pegasus-desktop-mac.dmg"
