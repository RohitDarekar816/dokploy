# Local Development & Redeployment

## Prerequisites (one-time)

- Docker with Swarm mode active (`docker info | grep Swarm` should show `active`)
- Node v24 via nvm (`~/.nvm/versions/node/v24.11.0`)
- pnpm v10

---

## First-time setup

```bash
# 1. Install dependencies
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH
pnpm install

# 2. Copy env file
cp apps/dokploy/.env.example apps/dokploy/.env
# Edit PORT=3001 if something else is already on 3000

# 3. Switch @dokploy/server to TypeScript source (dev mode)
pnpm run server:script

# 4. Spin up Docker services + run migrations
pnpm run dokploy:setup
```

Or just run the convenience script:

```bash
./dev.sh
```

---

## Starting the dev server

```bash
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH
pnpm run dokploy:dev
```

Dashboard: **http://localhost:3001**

---

## When do you need to restart?

| What changed | Action needed |
|---|---|
| React component / page (`pages/`, `components/`) | **Nothing** — Next.js HMR reloads automatically |
| tRPC router (`server/api/routers/`) | **Nothing** — Next.js recompiles API routes on the next request |
| Service or utility in `packages/server/src/` | **Restart** the dev server |
| `server/server.ts` (WebSocket setup, cron jobs) | **Restart** the dev server |
| DB schema change | **Run migration → Restart** |
| New schema table added | **Restart** the dev server — the `drizzle()` instance is cached on `globalThis` in dev mode, so `db.query.<newTable>` will be `undefined` until the process is restarted and the cache is rebuilt |

---

## How to restart the dev server

### Option A — if running in a terminal

Press `Ctrl+C`, then:

```bash
pnpm run dokploy:dev
```

### Option B — if running as a background process

```bash
# Find and kill the tsx process
pkill -f "server/server.ts"

# Start again
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH
pnpm run dokploy:dev
```

---

## After a DB schema change

```bash
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH

# 1. Generate migration SQL
pnpm --filter=dokploy run migration:generate

# 2. Apply migration
pnpm --filter=dokploy run migration:run

# 3. Restart the server (see above)
pkill -f "server/server.ts"
pnpm run dokploy:dev
```

---

## Checking Docker services

```bash
# List running Swarm services (postgres, redis)
docker service ls

# List all containers (includes traefik)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

If services are missing, re-run setup (it is idempotent):

```bash
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH
pnpm run dokploy:setup
```

---

## Testing the DigitalOcean feature

1. Open **http://localhost:3001** and register/login
2. Go to **Settings → Servers**
3. Click **"Launch on DigitalOcean"**
4. Paste a DO API token (Read+Write scope) from https://cloud.digitalocean.com/account/api/tokens
5. Select region, size, SSH key, and a server name → click **Launch Droplet**
6. Wait ~60 s for the droplet to become active — the IP will be assigned automatically
7. Once done, the server appears in the list. Click **Setup Server** to install Docker/Traefik/Dokploy on it.

> **Note:** You need at least one SSH key added in **Settings → SSH Keys** before launching.

---

## Useful commands

```bash
# View live server logs (if started in background)
tail -f /tmp/dokploy-dev.log

# Open Drizzle Studio (DB browser)
export PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH
pnpm --filter=dokploy run db:studio

# Run type-check across all packages
pnpm typecheck

# Reset the database (destructive)
pnpm --filter=dokploy run db:clean
pnpm --filter=dokploy run migration:run
```
