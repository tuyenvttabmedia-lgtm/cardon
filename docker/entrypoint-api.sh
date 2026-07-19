#!/bin/sh
set -e

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
