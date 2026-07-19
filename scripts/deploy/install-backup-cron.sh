#!/usr/bin/env bash
# Install daily Postgres backup cron on VPS
# Usage: sudo ./scripts/deploy/install-backup-cron.sh /opt/cardon
set -euo pipefail

APP_DIR="${1:-/opt/cardon}"
CRON_FILE="/etc/cron.d/cardon-backup"

cat > "${CRON_FILE}" <<EOF
# CardOn daily DB backup — 02:30 Asia/Ho_Chi_Minh
30 2 * * * root cd ${APP_DIR} && ${APP_DIR}/scripts/backup-db.sh >> /var/log/cardon-backup.log 2>&1
EOF

chmod 644 "${CRON_FILE}"
echo "[install-backup-cron] Installed ${CRON_FILE}"
