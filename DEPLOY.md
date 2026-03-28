# Gewu Deployment Guide

This guide is written for a non-developer operator. It brings up the full Gewu stack on a fresh Alibaba Cloud ECS instance with Docker Compose.

## What this deployment includes

- `web`: user-facing Next.js frontend
- `admin`: Vite-based admin console under `/admin`
- `api`: Fastify backend under `/api`
- `worker`: BullMQ document-processing worker
- `postgres`: database
- `redis`: queue/cache
- `nginx`: reverse proxy

## Current production note

- Real payment gateway integration is still mocked.
- Real third-party LLM API routing is still mocked.
- The current deployment is suitable for staging, demo, internal review, and pre-launch verification.

## Step 1: Buy and enter an ECS machine

1. Buy an ECS instance with Ubuntu 22.04 LTS or Ubuntu 24.04 LTS.
2. Open at least port `80` in the ECS security group.
3. Point your domain DNS to the ECS public IP.
4. If you want `www`, add `www.YOUR_DOMAIN` to the same server as either:
   - a `CNAME` to the apex domain
   - or an `A` record to the same ECS public IP
5. Connect to the server through SSH.

Example:

```bash
ssh root@YOUR_ECS_PUBLIC_IP
```

## Step 2: Install Git if your machine does not have it

```bash
apt-get update
apt-get install -y git
```

## Step 3: Clone the repository

Replace the repository URL with your own GitHub repository URL.

```bash
git clone YOUR_GITHUB_REPO_URL gewu
cd gewu
```

## Step 4: Review `.env` if needed

The deployment script will create `.env` from `.env.example` automatically if it does not exist, and it will also auto-generate random secrets for the placeholder values.

If you want to set your public IP or domain before deploying, you can edit:

```bash
APP_WEB_BASE_URL=http://YOUR_ECS_PUBLIC_IP
```

Example with a real domain:

```bash
APP_WEB_BASE_URL=http://restin.top
```

in the `.env` file.

## Step 5: Run one command

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will automatically:

1. Install Docker and Docker Compose if they are missing.
2. Create `.env` when needed.
3. Generate random secrets for placeholder values.
4. Build all images.
5. Start PostgreSQL and Redis.
6. Apply the Prisma schema.
7. Start `web`, `admin`, `api`, `worker`, and `nginx`.
8. Verify health endpoints.
9. Verify seeded default plans, models, and settings.

## Step 6: Open the website

After the script finishes, open:

- Frontend: `http://YOUR_ECS_PUBLIC_IP/`
- Admin: `http://YOUR_ECS_PUBLIC_IP/admin/`

The deployment script prints the admin username and password at the end.

## Routine operations

Restart everything:

```bash
docker compose restart
```

See running services:

```bash
docker compose ps
```

See logs:

```bash
docker compose logs -f
```

Stop everything:

```bash
docker compose down
```

Stop everything and remove volumes:

```bash
docker compose down -v
```

## When you are ready for real production

Replace the following before public launch:

1. SMTP credentials
2. Real payment gateway keys
3. Real model provider API keys
4. `APP_WEB_BASE_URL` with your actual domain
5. Optional Sentry DSN for error monitoring

## Environment variable reference

See the root `.env.example` file for the full list of variables and inline comments describing what each one is for.
