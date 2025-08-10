#!/usr/bin/env bash
set -euo pipefail

# Stop any existing dev server on port 3000
if lsof -ti tcp:3000 >/dev/null 2>&1; then
  lsof -ti tcp:3000 | xargs -r kill
fi

# Clean build artifacts safely before starting a fresh dev server
rm -rf .next

# Start a single dev server in the foreground
npm run dev


