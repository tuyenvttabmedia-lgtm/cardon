#!/usr/bin/env bash
# CardOn — Local / staging backup+restore simulation
# Creates an ephemeral test DB. Prefer scripts/verify-backup-restore.sh on production.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TEST_DB="cardon_restore_test"
CONTAINER="${POSTGRES_CONTAINER:-cardon-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
MAIN_DB="${POSTGRES_DB:-cardon}"

mkdir -p "${BACKUP_DIR}"

echo "[test-backup-restore] Step 1: backup main database"
POSTGRES_CONTAINER="${CONTAINER}" POSTGRES_USER="${POSTGRES_USER}" POSTGRES_DB="${MAIN_DB}" \
  "${SCRIPT_DIR}/backup-db.sh" "${BACKUP_DIR}"
BACKUP_FILE="$(ls -t "${BACKUP_DIR}/cardon_${MAIN_DB}_"*.sql.gz | grep -v '_latest\.sql\.gz$' | head -1)"
echo "[test-backup-restore] Using ${BACKUP_FILE}"

echo "[test-backup-restore] Step 2–5: verify restore"
POSTGRES_CONTAINER="${CONTAINER}" POSTGRES_USER="${POSTGRES_USER}" POSTGRES_DB="${MAIN_DB}" \
  BACKUP_DIR="${BACKUP_DIR}" RESTORE_TEST_DB="${TEST_DB}" \
  "${SCRIPT_DIR}/verify-backup-restore.sh" "${BACKUP_FILE}"

echo "[test-backup-restore] PASS"
