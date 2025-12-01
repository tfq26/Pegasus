#!/bin/zsh
# Script to run both UI and backend apps in Pegasus project using Bun

echo "Starting backend..."
cd apps/backend
bun install
bun run index.js &
BACKEND_PID=$!
cd ../..

echo "Starting UI..."
cd apps/ui
bun install
bun dev &
UI_PID=$!
cd ../..

# Wait for both processes
trap "kill $BACKEND_PID $UI_PID" EXIT
wait $BACKEND_PID $UI_PID