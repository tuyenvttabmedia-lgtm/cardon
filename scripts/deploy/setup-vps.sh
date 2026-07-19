#!/usr/bin/env bash
# CardOn — Ubuntu VPS initial setup (Phase 6B)
set -euo pipefail

echo "[setup-vps] CardOn VPS preparation"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo" >&2
  exit 1
fi

timedatectl set-timezone Asia/Ho_Chi_Minh

apt-get update
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin || true
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[setup-vps] Docker: $(docker --version)"
echo "[setup-vps] Compose: $(docker compose version)"
echo "[setup-vps] Timezone: $(timedatectl show -p Timezone --value)"
echo "[setup-vps] Done"
