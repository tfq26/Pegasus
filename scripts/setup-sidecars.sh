#!/bin/bash

# Pegasus Sidecar Setup Script
# Downloads the Ollama binary for the current platform and preps it for Tauri bundling.

echo "🦄 Pegasus Sidecar Setup"
echo "======================="

TARGET_DIR="apps/desktop/src-tauri/binaries"
mkdir -p "$TARGET_DIR"

# Detect OS and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "📍 Detected System: $OS ($ARCH)"

OLLAMA_URL=""
FILENAME=""

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        # Mac Apple Silicon
        OLLAMA_URL="https://ollama.com/download/ollama-darwin" # Note: Ollama distributes a Universal binary or specific ones? 
        # Actually, Ollama's main download is a zip of the .app. Use the CLI binary direct link if available, 
        # or assume we copy from local system if installed.
        # Stability Hack: The easiest way to get the CLI binary is to verify if it's installed locally, or download a specific release.
        # Let's try to copy from local first (Developer convenience), then fallback.
        
        if command -v ollama &> /dev/null; then
            echo "✅ Found local Ollama installation."
            cp $(which ollama) "$TARGET_DIR/ollama-aarch64-apple-darwin"
            echo "📦 Copied local binary to $TARGET_DIR/ollama-aarch64-apple-darwin"
            exit 0
        else
            echo "⚠️ Local Ollama not found. Attempting download..."
            # This is tricky because Ollama doesn't publish loose binaries easily on their main page. 
            # They use GitHub Releases.
            GITHUB_TAG="v0.5.4" # Pinning a recent stable version
            curl -L "https://github.com/ollama/ollama/releases/download/$GITHUB_TAG/ollama-darwin" -o "$TARGET_DIR/ollama-aarch64-apple-darwin"
        fi
    fi
elif [ "$OS" = "Linux" ]; then
   echo "Linux support TBD"
fi

if [ -f "$TARGET_DIR/ollama-aarch64-apple-darwin" ]; then
    chmod +x "$TARGET_DIR/ollama-aarch64-apple-darwin"
    echo "🎉 Success! Sidecar binary is ready for 'tauri build'."
else
    echo "❌ Failed to setup binary. Please manually copy 'ollama' to $TARGET_DIR/ollama-target-triple"
fi
