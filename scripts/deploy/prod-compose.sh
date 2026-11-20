#!/usr/bin/env bash
# Safe production compose wrapper — ALWAYS loads .env.production for interpolation.
# Usage (on VPS /opt/cardon):
#   ./scripts/deploy/prod-compose.sh build api
#   ./scripts/deploy/prod-compose.sh up -d api
#   ./scripts/deploy/prod-compose.sh ps
#
# NEVER run bare: docker compose -f docker-compose.production.yml up …
# without --env-file — empty ${POSTGRES_*} recreates DB with blank credentials.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: missing $ENV_FILE (cwd=$ROOT)" >&2
  exit 1
fi

missing=()
for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET ENCRYPTION_KEY; do
  val="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  if [[ -z "${val//[[:space:]]/}" ]]; then
    missing+=("$key")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "FATAL: $ENV_FILE has empty required keys: ${missing[*]}" >&2
  echo "Hint: bash scripts/deploy/restore-prod-env-from-worker.sh" >&2
  exit 1
fi

# Refuse known compose-default placeholders that passed Joi min-length historically.
jwt="$(grep -E '^JWT_SECRET=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
enc="$(grep -E '^ENCRYPTION_KEY=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
case "$jwt" in
  dev-jwt-secret*|change-me*|changeme*)
    echo "FATAL: JWT_SECRET still looks like a development placeholder" >&2
    exit 1
    ;;
esac
case "$enc" in
  dev-encryption-key*|change-me*|changeme*)
    echo "FATAL: ENCRYPTION_KEY still looks like a development placeholder" >&2
    exit 1
    ;;
esac

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
