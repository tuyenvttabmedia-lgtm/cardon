#!/usr/bin/env bash
# Install CardOn backup + restore-verify cron on VPS
# Usage: sudo ./scripts/deploy/install-backup-cron.sh [/opt/cardon]
set -euo pipefail

APP_DIR="${1:-/opt/cardon}"
CRON_FILE="/etc/cron.d/cardon-backup"
LOG_FILE="/var/log/cardon-backup.log"
VERIFY_LOG="/var/log/cardon-backup-restore.log"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "[install-backup-cron] ERROR: ${APP_DIR} not found" >&2
  exit 1
fi

chmod +x \
  "${APP_DIR}/scripts/backup-db.sh" \
  "${APP_DIR}/scripts/backup-uploads.sh" \
  "${APP_DIR}/scripts/restore-db.sh" \
  "${APP_DIR}/scripts/verify-backup-restore.sh" \
  "${APP_DIR}/scripts/test-backup-restore.sh" \
  "${APP_DIR}/scripts/deploy/install-backup-cron.sh" \
  2>/dev/null || true

mkdir -p "${APP_DIR}/backups/monthly"
touch "${LOG_FILE}" "${VERIFY_LOG}"
chmod 644 "${LOG_FILE}" "${VERIFY_LOG}"

# Host timezone should be Asia/Ho_Chi_Minh (VPS already is).
# Invoke via bash so missing +x never silently breaks nightly jobs again.
cat > "${CRON_FILE}" <<EOF
# CardOn backup jobs (Asia/Ho_Chi_Minh wall clock on this host)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Daily Postgres dump — 02:30
30 2 * * * root cd ${APP_DIR} && /bin/bash ${APP_DIR}/scripts/backup-db.sh >> ${LOG_FILE} 2>&1

# Daily restore verification against latest dump — 02:45
45 2 * * * root cd ${APP_DIR} && /bin/bash ${APP_DIR}/scripts/verify-backup-restore.sh >> ${VERIFY_LOG} 2>&1

# Weekly uploads archive — Sunday 03:15
15 3 * * 0 root cd ${APP_DIR} && /bin/bash ${APP_DIR}/scripts/backup-uploads.sh >> ${LOG_FILE} 2>&1
EOF

chmod 644 "${CRON_FILE}"
echo "[install-backup-cron] Installed ${CRON_FILE}"
echo "[install-backup-cron] Logs: ${LOG_FILE} , ${VERIFY_LOG}"
echo "[install-backup-cron] Run once now with:"
echo "  /bin/bash ${APP_DIR}/scripts/backup-db.sh && /bin/bash ${APP_DIR}/scripts/verify-backup-restore.sh"
