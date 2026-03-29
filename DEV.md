# Gewu Local Development Guide

This guide covers running Gewu locally with `npm run dev`.

## 1) Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (recommended for local PostgreSQL/Redis)

## 2) Create local env

```bash
cp .env.example .env
```

Default local-safe values in `.env.example`:

- `STORE_PERSISTENCE_ENABLED=false` (in-memory store)
- `ENABLE_QUEUE=false` (no BullMQ worker required)
- `REDIS_URL=redis://127.0.0.1:6379`

This means `npm run dev` works immediately without Redis/PostgreSQL.

## 3) Start with full local dependencies (recommended)

If you want DB persistence and queue processing in local development:

```bash
docker compose up -d postgres redis
```

Then set in `.env`:

```env
STORE_PERSISTENCE_ENABLED=true
ENABLE_QUEUE=true
REDIS_URL=redis://127.0.0.1:6379
API_INTERNAL_BASE_URL=http://127.0.0.1:4000
```

## 4) Start all dev services

```bash
npm install
npm run dev
```

This starts:

- web (`apps/web`)
- admin (`apps/admin`)
- api (`apps/api`)
- worker (`apps/worker`)

## 5) Common issues and fixes

### Redis ECONNREFUSED (127.0.0.1:6379)

Cause: queue is enabled but Redis is not running.

Fix options:

1. Start Redis: `docker compose up -d redis`
2. Or disable queue locally: `ENABLE_QUEUE=false`

### Next.js cache corruption (`Cannot find module './682.js'` / `__webpack_modules__[moduleId] is not a function`)

Clear Next.js build cache and restart web dev server:

```bash
# PowerShell
Remove-Item -Recurse -Force apps/web/.next

# Bash
rm -rf apps/web/.next
```

### `dashboard-shell.tsx` missing error on `/zh/AI-search`

Expected component path:

- `apps/web/src/components/dashboard-shell.tsx`

Check import in `apps/web/src/app/zh/layout.tsx`:

```ts
import { DashboardShell } from "@/components/dashboard-shell";
```

## 6) Optional: run only databases with Docker

```bash
docker compose up -d postgres redis
```

Then run app code with local hot reload via `npm run dev`.