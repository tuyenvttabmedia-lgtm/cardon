#!/usr/bin/env bash
# Package source for VPS deploy — NEVER includes .env.production or SSL private keys.
set -eu
cd "$(dirname "$0")/../.."
OUT="${1:-$HOME/cardon-deploy.tgz}"
rm -f "$OUT"
tar -czf "$OUT" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=dist \
  --exclude=backups \
  --exclude='*.tgz' \
  --exclude=.env.production \
  --exclude=.env.local-production \
  --exclude=infra/nginx/ssl/cardon.vn.key \
  --exclude=infra/nginx/ssl/cardon.vn.pem \
  .
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
