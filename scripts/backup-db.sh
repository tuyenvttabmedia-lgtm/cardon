#!/usr/bin/env bash
# CardOn — PostgreSQL backup script
# Usage:
#   ./scripts/backup-db.sh
#   ./scripts/backup-db.sh /path/to/backups
#
# Requires: docker compose production stack running, or pg_dump locally.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${1:-${PROJECT_ROOT}/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
ENV_FILE="${PROJECT_ROOT}/.env.production"

mkdir -p "${BACKUP_DIR}"

read_env() {
  local key="$1"
  grep -m1 "^${key}=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || true
}

if [[ -f "${ENV_FILE}" ]]; then
  POSTGRES_USER="$(read_env POSTGRES_USER)"
  POSTGRES_DB="$(read_env POSTGRES_DB)"
fi

POSTGRES_USER="${POSTGRES_USER:-cardon}"
POSTGRES_DB="${POSTGRES_DB:-cardon}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-cardon-prod-postgres}"
OUTPUT_FILE="${BACKUP_DIR}/cardon_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "[backup-db] Target: ${OUTPUT_FILE}"

if docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  docker exec -t "${POSTGRES_CONTAINER}" \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
    | gzip > "${OUTPUT_FILE}"
else
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "[backup-db] ERROR: Postgres container not running and pg_dump not found." >&2
    exit 1
  fi
  pg_dump "${DATABASE_URL:?DATABASE_URL required when not using Docker}" \
    --no-owner --no-acl | gzip > "${OUTPUT_FILE}"
fi

echo "[backup-db] Done ($(du -h "${OUTPUT_FILE}" | cut -f1))"

# Optional retention — keep last 14 daily backups
find "${BACKUP_DIR}" -name "cardon_${POSTGRES_DB}_*.sql.gz" -mtime +14 -delete 2>/dev/null || true
