#!/usr/bin/env bash
# CardOn — PostgreSQL restore script
# Usage:
#   ./scripts/restore-db.sh backups/cardon_cardon_20260618_120000.sql.gz
#
# WARNING: This replaces data in the target database. Stop API/worker first.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.production"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[restore-db] ERROR: File not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a && source "${ENV_FILE}" && set +a
fi

POSTGRES_USER="${POSTGRES_USER:-cardon}"
POSTGRES_DB="${POSTGRES_DB:-cardon}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-cardon-prod-postgres}"

echo "[restore-db] Restoring ${BACKUP_FILE} → ${POSTGRES_DB}"
read -r -p "This will OVERWRITE database ${POSTGRES_DB}. Continue? [y/N] " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

if docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${POSTGRES_CONTAINER}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --single-transaction
else
  if ! command -v psql >/dev/null 2>&1; then
    echo "[restore-db] ERROR: Postgres container not running and psql not found." >&2
    exit 1
  fi
  gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL:?DATABASE_URL required when not using Docker}"
fi

echo "[restore-db] Restore complete."
