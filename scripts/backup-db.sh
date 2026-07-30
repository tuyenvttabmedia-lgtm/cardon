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
ENV_FILE="${PROJECT_ROOT}/.env.production"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}/monthly"

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
LATEST_FILE="${BACKUP_DIR}/cardon_${POSTGRES_DB}_latest.sql.gz"

echo "[backup-db] $(date -Is) Target: ${OUTPUT_FILE}"

# Do not use `docker exec -t` — TTY allocation breaks under cron.
if docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  docker exec "${POSTGRES_CONTAINER}" \
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

SIZE_BYTES="$(wc -c < "${OUTPUT_FILE}" | tr -d ' ')"
if [[ "${SIZE_BYTES}" -lt 1000 ]]; then
  echo "[backup-db] ERROR: backup too small (${SIZE_BYTES} bytes) — refusing to keep" >&2
  rm -f "${OUTPUT_FILE}"
  exit 1
fi

cp -f "${OUTPUT_FILE}" "${LATEST_FILE}"

# Keep first successful dump of each calendar month for 12 months.
DAY_OF_MONTH="$(date +%d)"
MONTH_TAG="$(date +%Y%m)"
MONTHLY_FILE="${BACKUP_DIR}/monthly/cardon_${POSTGRES_DB}_${MONTH_TAG}.sql.gz"
if [[ "${DAY_OF_MONTH}" == "01" || ! -f "${MONTHLY_FILE}" ]]; then
  cp -f "${OUTPUT_FILE}" "${MONTHLY_FILE}"
fi

echo "[backup-db] Done ($(du -h "${OUTPUT_FILE}" | cut -f1)) → also ${LATEST_FILE}"

find "${BACKUP_DIR}" -maxdepth 1 -name "cardon_${POSTGRES_DB}_*.sql.gz" \
  ! -name "cardon_${POSTGRES_DB}_latest.sql.gz" \
  -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
find "${BACKUP_DIR}/monthly" -name "cardon_${POSTGRES_DB}_*.sql.gz" \
  -mtime +365 -delete 2>/dev/null || true
