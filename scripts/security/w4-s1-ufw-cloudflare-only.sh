#!/usr/bin/env bash
# W4 S1 — Lock origin 80/443 to Cloudflare IPv4+IPv6; SSH via Tailscale (optional break-glass).
# DO NOT RUN until owner change window + Vultr console access + orange-cloud confirmed.
# Snapshot: 2026-11-09 CF published ranges (refresh from https://www.cloudflare.com/ips-v4|ips-v6 before apply).
set -euo pipefail

BACKUP="/root/ufw-backup-w4-s1-$(date +%Y%m%d-%H%M%S).txt"
BREAK_GLASS_IP="${BREAK_GLASS_IP:-}" # optional: export BREAK_GLASS_IP=x.x.x.x before run

if [[ "${I_UNDERSTAND_LOCKOUT_RISK:-}" != "yes" ]]; then
  echo "Refusing: set I_UNDERSTAND_LOCKOUT_RISK=yes and ensure Vultr console + Tailscale SSH first."
  exit 1
fi

echo "==> Backup ufw status → ${BACKUP}"
ufw status verbose > "${BACKUP}"
ufw status numbered >> "${BACKUP}"

echo "==> Ensure Tailscale SSH allow BEFORE removing Anywhere:22"
ufw allow from 100.64.0.0/10 to any port 22 proto tcp comment 'Tailscale SSH' || true
ufw allow from fd7a:115c:a1e0::/48 to any port 22 proto tcp comment 'Tailscale SSH v6' || true
if [[ -n "${BREAK_GLASS_IP}" ]]; then
  ufw allow from "${BREAK_GLASS_IP}" to any port 22 proto tcp comment 'Ops break-glass SSH'
fi

echo "==> Allow Cloudflare → 80/443 (IPv4)"
CF_V4=(
  173.245.48.0/20
  103.21.244.0/22
  103.22.200.0/22
  103.31.4.0/22
  141.101.64.0/18
  108.162.192.0/18
  190.93.240.0/20
  188.114.96.0/20
  197.234.240.0/22
  198.41.128.0/17
  162.158.0.0/15
  104.16.0.0/13
  104.24.0.0/14
  172.64.0.0/13
  131.0.72.0/22
)
for cidr in "${CF_V4[@]}"; do
  ufw allow from "${cidr}" to any port 80 proto tcp comment 'Cloudflare'
  ufw allow from "${cidr}" to any port 443 proto tcp comment 'Cloudflare'
done

echo "==> Allow Cloudflare → 80/443 (IPv6)"
CF_V6=(
  2400:cb00::/32
  2606:4700::/32
  2803:f800::/32
  2405:b500::/32
  2405:8100::/32
  2a06:98c0::/29
  2c0f:f248::/32
)
for cidr in "${CF_V6[@]}"; do
  ufw allow from "${cidr}" to any port 80 proto tcp comment 'Cloudflare'
  ufw allow from "${cidr}" to any port 443 proto tcp comment 'Cloudflare'
done

echo "==> MANUAL: delete old Anywhere rules for 22/80/443 (v4+v6)."
echo "    Run: ufw status numbered"
echo "    Then: ufw delete <N> for each Anywhere OpenSSH / 80 / 443 rule"
echo "    Do NOT ufw --force reset"
echo "==> After deletes: ufw reload && ufw status verbose"
echo "==> Verify: https://cardon.vn via CF OK; https://ORIGIN_IP should fail; SSH via Tailscale OK"
echo "Backup kept at ${BACKUP}"
