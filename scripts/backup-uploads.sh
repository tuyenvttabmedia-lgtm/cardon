#!/usr/bin/env bash
# CardOn — Backup uploads volume / local media folder
# Usage: ./scripts/backup-uploads.sh [output_dir]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${1:-${PROJECT_ROOT}/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="${BACKUP_DIR}/cardon_uploads_${TIMESTAMP}.tar.gz"
UPLOADS_ROOT="${UPLOADS_ROOT:-${PROJECT_ROOT}/uploads}"
API_CONTAINER="${API_CONTAINER:-cardon-prod-api}"

mkdir -p "${BACKUP_DIR}"

if docker ps --format '{{.Names}}' | grep -qx "${API_CONTAINER}"; then
  echo "[backup-uploads] Archiving /app/uploads from ${API_CONTAINER}"
  docker exec "${API_CONTAINER}" sh -c 'cd /app && tar -czf - uploads 2>/dev/null || true' > "${OUTPUT}"
else
  if [[ ! -d "${UPLOADS_ROOT}" ]]; then
    echo "[backup-uploads] WARN: ${UPLOADS_ROOT} not found — creating empty archive"
    mkdir -p "${UPLOADS_ROOT}"
  fi
  echo "[backup-uploads] Archiving ${UPLOADS_ROOT}"
  tar -czf "${OUTPUT}" -C "$(dirname "${UPLOADS_ROOT}")" "$(basename "${UPLOADS_ROOT}")"
fi

echo "[backup-uploads] Done: ${OUTPUT} ($(du -h "${OUTPUT}" | cut -f1))"
