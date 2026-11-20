#!/bin/sh
set -e

# Fail fast when compose was started without --env-file (.env.production).
# Empty POSTGRES_* yields DATABASE_URL like postgresql://:@postgres:5432/...
assert_runtime_secrets() {
  case "${DATABASE_URL:-}" in
    ""|postgresql://:@*|postgres://:@*|postgresql://@*|postgres://@*|postgresql://:*@*|postgres://:*@*)
      echo "[entrypoint] FATAL: DATABASE_URL missing user/password — deploy with --env-file .env.production (see scripts/deploy/prod-compose.sh)" >&2
      exit 1
      ;;
  esac
  case "${JWT_SECRET:-}" in
    ""|dev-jwt-secret*|change-me*|changeme*)
      echo "[entrypoint] FATAL: JWT_SECRET missing or development placeholder — check --env-file .env.production" >&2
      exit 1
      ;;
  esac
  case "${ENCRYPTION_KEY:-}" in
    ""|dev-encryption-key*|change-me*|changeme*)
      echo "[entrypoint] FATAL: ENCRYPTION_KEY missing or development placeholder — check --env-file .env.production" >&2
      exit 1
      ;;
  esac
}

assert_runtime_secrets

run_with_db_retry() {
  label="$1"
  shift
  i=0
  max=30
  until "$@"; do
    i=$((i + 1))
    if [ "$i" -ge "$max" ]; then
      echo "[entrypoint] ${label} failed after ${max} attempts"
      exit 1
    fi
    echo "[entrypoint] ${label} failed, retry ${i}/${max} in 3s..."
    sleep 3
  done
}

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  run_with_db_retry "prisma migrate deploy" npx prisma migrate deploy
  npx prisma generate
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Running database seed (prisma/seed.mjs)..."
  run_with_db_retry "database seed" node prisma/seed.mjs
fi

exec "$@"
