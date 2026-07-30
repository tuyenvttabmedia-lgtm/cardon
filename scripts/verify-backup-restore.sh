#!/usr/bin/env bash
# CardOn — Non-destructive restore verification
# Restores the latest backup into an isolated database, checks key tables,
# then drops the test DB. Never writes to the production database name.
#
# Usage:
#   ./scripts/verify-backup-restore.sh
#   ./scripts/verify-backup-restore.sh /path/to/backups/cardon_cardon_....sql.gz
#
# Env overrides:
#   POSTGRES_CONTAINER, POSTGRES_USER, POSTGRES_DB, BACKUP_DIR

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.production"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
TEST_DB="${RESTORE_TEST_DB:-cardon_restore_test}"
OPS_LOG="${RESTORE_VERIFY_LOG:-${BACKUP_DIR}/RESTORE_VERIFY.log}"

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

if [[ $# -ge 1 ]]; then
  BACKUP_FILE="$1"
else
  if [[ -f "${BACKUP_DIR}/cardon_${POSTGRES_DB}_latest.sql.gz" ]]; then
    BACKUP_FILE="${BACKUP_DIR}/cardon_${POSTGRES_DB}_latest.sql.gz"
  else
    BACKUP_FILE="$(ls -t "${BACKUP_DIR}"/cardon_"${POSTGRES_DB}"_*.sql.gz 2>/dev/null | head -1 || true)"
  fi
fi

if [[ -z "${BACKUP_FILE:-}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "[verify-backup-restore] ERROR: no backup file found under ${BACKUP_DIR}" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  echo "[verify-backup-restore] ERROR: container ${POSTGRES_CONTAINER} is not running" >&2
  exit 1
fi

if [[ "${TEST_DB}" == "${POSTGRES_DB}" ]]; then
  echo "[verify-backup-restore] ERROR: refusing to use production DB name as test DB" >&2
  exit 1
fi

log_result() {
  local status="$1"
  local detail="$2"
  mkdir -p "$(dirname "${OPS_LOG}")"
  echo "$(date -Is) status=${status} backup=$(basename "${BACKUP_FILE}") ${detail}" | tee -a "${OPS_LOG}"
}

echo "[verify-backup-restore] $(date -Is) Using ${BACKUP_FILE}"
echo "[verify-backup-restore] Creating isolated DB ${TEST_DB}"

docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true
docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS ${TEST_DB};"
docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE ${TEST_DB};"

echo "[verify-backup-restore] Restoring into ${TEST_DB}"
if ! gunzip -c "${BACKUP_FILE}" | docker exec -i "${POSTGRES_CONTAINER}" \
  psql -U "${POSTGRES_USER}" -d "${TEST_DB}" --single-transaction -v ON_ERROR_STOP=1 -q; then
  log_result FAIL "restore_failed"
  docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c \
    "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
  exit 1
fi

TABLE_COUNT="$(docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
ORDERS_COUNT="$(docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
  "SELECT COUNT(*) FROM orders;" 2>/dev/null || echo "MISSING")"
PAYMENTS_OK="$(docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${TEST_DB}" -tAc \
  "SELECT COUNT(*) FROM payments WHERE status='SUCCESS';" 2>/dev/null || echo "MISSING")"

docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null

DETAIL="tables=${TABLE_COUNT} orders=${ORDERS_COUNT} payments_success=${PAYMENTS_OK}"

if [[ "${TABLE_COUNT}" -lt 5 ]]; then
  log_result FAIL "${DETAIL}"
  echo "[verify-backup-restore] FAIL: expected >=5 public tables, got ${TABLE_COUNT}" >&2
  exit 1
fi

if [[ "${ORDERS_COUNT}" == "MISSING" || "${PAYMENTS_OK}" == "MISSING" ]]; then
  log_result FAIL "${DETAIL}"
  echo "[verify-backup-restore] FAIL: orders/payments tables missing after restore" >&2
  exit 1
fi

log_result PASS "${DETAIL}"
echo "[verify-backup-restore] PASS — ${DETAIL}"
