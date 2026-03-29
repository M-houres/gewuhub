#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

SUDO_CMD=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO_CMD=(sudo)
fi

run_cmd() {
  if [[ "${#SUDO_CMD[@]}" -gt 0 ]]; then
    "${SUDO_CMD[@]}" "$@"
  else
    "$@"
  fi
}

log() {
  printf '[deploy] %s\n' "$1"
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker"
  curl -fsSL https://get.docker.com | run_cmd sh
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker Compose plugin"
  run_cmd apt-get update
  run_cmd apt-get install -y docker-compose-plugin
}

ensure_env_file() {
  if [[ -f .env ]]; then
    return
  fi

  log "Creating .env from .env.example"
  cp .env.example .env
}

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

maybe_randomize_secret() {
  local key="$1"
  local current_value
  current_value="$(grep -E "^${key}=" .env | head -n 1 | cut -d'=' -f2- || true)"

  if [[ -z "$current_value" || "$current_value" == change-me-* ]]; then
    local generated
    generated="$(openssl rand -hex 24)"
    log "Generating random value for ${key}"
    set_env_value "$key" "$generated"
  fi
}

maybe_set_public_base_url() {
  local current_value
  current_value="$(grep -E '^APP_WEB_BASE_URL=' .env | head -n 1 | cut -d'=' -f2- || true)"

  if [[ -n "$current_value" && "$current_value" != "http://localhost" ]]; then
    return
  fi

  local public_ip=""
  public_ip="$(curl -fsS https://api.ipify.org || true)"
  if [[ -n "$public_ip" ]]; then
    log "Setting APP_WEB_BASE_URL to detected public IP"
    set_env_value "APP_WEB_BASE_URL" "http://${public_ip}"
  fi
}

wait_for_compose_command() {
  local description="$1"
  shift

  for _ in $(seq 1 40); do
    if "$@" >/dev/null 2>&1; then
      log "${description} is ready"
      return
    fi
    sleep 3
  done

  log "Timed out while waiting for ${description}"
  return 1
}

wait_for_http() {
  local description="$1"
  local url="$2"

  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "${description} is ready"
      return
    fi
    sleep 3
  done

  log "Timed out while waiting for ${description} at ${url}"
  return 1
}

log "Preparing deployment prerequisites"
ensure_docker
ensure_compose
run_cmd apt-get update
run_cmd apt-get install -y curl git ca-certificates openssl

ensure_env_file
maybe_randomize_secret "POSTGRES_PASSWORD"
maybe_randomize_secret "ADMIN_TOKEN"
maybe_randomize_secret "ADMIN_PASSWORD"
maybe_randomize_secret "PAYMENT_CALLBACK_SECRET"
maybe_randomize_secret "DOCX_WORKER_SECRET"
maybe_set_public_base_url

set -a
# shellcheck disable=SC1091
source ./.env
set +a

LOCAL_BASE_URL="http://127.0.0.1:${NGINX_PORT:-80}"

if [[ -d .git ]]; then
  log "Refreshing repository state"
  git pull --ff-only || true
fi

log "Building service images"
docker compose build --pull

log "Starting PostgreSQL and Redis"
docker compose up -d postgres redis

wait_for_compose_command "PostgreSQL" docker compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
wait_for_compose_command "Redis" bash -lc "docker compose exec -T redis redis-cli ping | grep -q PONG"

log "Applying Prisma schema"
docker compose run --rm api npm run prisma:deploy -w api

log "Starting application services"
docker compose up -d api worker web admin nginx

wait_for_http "API" "${LOCAL_BASE_URL}/api/health"
wait_for_http "Web" "${LOCAL_BASE_URL}/"
wait_for_http "Admin" "${LOCAL_BASE_URL}/admin/"

wait_for_compose_command "Worker container" bash -lc "docker compose ps --status running worker | grep -q worker"

log "Verifying seeded default data"
curl -fsS -H "x-admin-token: ${ADMIN_TOKEN}" "${LOCAL_BASE_URL}/api/v1/admin/plans" >/dev/null
curl -fsS -H "x-admin-token: ${ADMIN_TOKEN}" "${LOCAL_BASE_URL}/api/v1/admin/models" >/dev/null
curl -fsS -H "x-admin-token: ${ADMIN_TOKEN}" "${LOCAL_BASE_URL}/api/v1/admin/settings" >/dev/null

log "Deployment finished successfully"
printf '\n'
printf 'Public site: %s\n' "${APP_WEB_BASE_URL}"
printf 'Admin URL: %s/admin/\n' "${APP_WEB_BASE_URL}"
printf 'Admin username: %s\n' "${ADMIN_USERNAME}"
printf 'Admin password: %s\n' "${ADMIN_PASSWORD}"
