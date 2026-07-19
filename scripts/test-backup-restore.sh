#!/usr/bin/env bash
# CardOn — Local backup/restore simulation (audit / CI)
# Uses dev postgres container or DATABASE_URL. Creates ephemeral test DB.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TEST_DB="cardon_restore_test"
CONTAINER="${POSTGRES_CONTAINER:-cardon-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
MAIN_DB="${POSTGRES_DB:-cardon}"

mkdir -p "${BACKUP_DIR}"

echo "[test-backup-restore] Step 1: backup main database"
POSTGRES_CONTAINER="${CONTAINER}" POSTGRES_USER="${POSTGRES_USER}" POSTGRES_DB="${MAIN_DB}" \
  "${SCRIPT_DIR}/backup-db.sh" "${BACKUP_DIR}"
BACKUP_FILE="$(ls -t "${BACKUP_DIR}/cardon_${MAIN_DB}_"*.sql.gz | head -1)"
echo "[test-backup-restore] Using ${BACKUP_FILE}"

echo "[test-backup-restore] Step 2: create test database ${TEST_DB}"
docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c \
  "DROP DATABASE IF EXISTS ${TEST_DB}; CREATE DATABASE ${TEST_DB};"

echo "[test-backup-restore] Step 3: restore into ${TEST_DB}"
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  psql -U "${POSTGRES_USER}" -d "${TEST_DB}" --single-transaction -q

echo "[test-backup-restore] Step 4: verify tables exist"
TABLE_COUNT="$(docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
if [[ "${TABLE_COUNT}" -lt 5 ]]; then
  echo "[test-backup-restore] FAIL: expected tables in restored DB, got ${TABLE_COUNT}" >&2
  exit 1
fi

echo "[test-backup-restore] Step 5: cleanup test database"
docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c \
  "DROP DATABASE IF EXISTS ${TEST_DB};"

echo "[test-backup-restore] PASS — ${TABLE_COUNT} tables restored successfully"
