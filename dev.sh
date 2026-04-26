#!/usr/bin/env bash
set -e

# Use Node v24 via nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24 2>/dev/null || export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"

echo "Node: $(node --version)  pnpm: $(pnpm --version)"

# Install deps if needed
if [ ! -d "node_modules/.pnpm" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Ensure .env exists
if [ ! -f "apps/dokploy/.env" ]; then
  cp apps/dokploy/.env.example apps/dokploy/.env
  echo "Created apps/dokploy/.env from example"
fi

# Switch server package to use TypeScript src (dev mode)
pnpm run server:script

# Run setup (idempotent — skips already-running services)
pnpm run dokploy:setup

# Start dev server
pnpm run dokploy:dev
