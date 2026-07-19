#!/usr/bin/env bash
set -eu
echo "=== ADMIN localhost URLs ==="
docker exec cardon-prod-admin grep -r localhost /app/apps/admin/.next/static/chunks 2>/dev/null | grep -oE 'http://localhost[^"'\'' ]+' | sort -u | head -10 || true
echo "=== PARTNER localhost URLs ==="
docker exec cardon-prod-partner grep -r localhost /app/apps/partner/.next/static/chunks 2>/dev/null | grep -oE 'http://localhost[^"'\'' ]+' | sort -u | head -10 || true
echo "=== ENV build URLs ==="
grep -E '^(ADMIN|PARTNER)_NEXT_PUBLIC' /opt/cardon/.env.production | cut -d= -f1
