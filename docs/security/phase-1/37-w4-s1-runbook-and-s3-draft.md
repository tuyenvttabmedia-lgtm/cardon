# 37 — W4 S1 Origin Firewall Runbook + S3 Nginx Draft

**Date:** 2026-11-09  
**Basis:** Plan `#34`, Evidence `#35` (updated), Gap `#36` (updated).  
**Mode:** S3 = **repo draft only** (no prod reload). S1 = **runbook only** (no ufw apply until owner change window).

---

## 1. Evidence refresh (prod SSH 2026-11-09)

| EG | Status | Finding |
|----|--------|---------|
| EG-2 | **CONFIRMED (weak)** | UFW active; `22/80/443` → `Anywhere` (+v6). API/DB/Redis **not** host-published. No Tailscale on Cardon host. |
| EG-3 | **CONFIRMED** | `docker exec cardon-prod-nginx nginx -T`: CF **IPv4-only** real_ip; **no** `limit_req`; SePay `webhooks` alias present; vhosts cardon/admin/partner. Matches repo tree pre-S3. |
| EG-4 | **CLOSED (owner)** | Prod SePay/PayPal webhooks on apex `cardon.vn`; Tunnel IPN-sandbox unused for prod. |
| EG-5 | **CONFIRMED (simple)** | Client → CF → Nginx:443 → API. No Tunnel on prod path. `cloudflared` inactive on origin. |
| EG-1 / EG-6 | **PARTIAL** | Owner: CF Free, DNS+proxied, Bot Fight On, 0 custom/RL (screenshots prior). Full Custom Rules export still thin — **S2 not applied**. |

SSH: public origin (not Tailscale); key `Privatekeyweb-manus.ppk`.

---

## 2. S3 — Nginx draft (repo)

### Files

| File | Change |
|------|--------|
| `infra/nginx/conf.d/00-cloudflare-real-ip.conf` | Add Cloudflare **IPv6** `set_real_ip_from` (W4-05) |
| `infra/nginx/conf.d/01-rate-limit-zones.conf` | **New** — `cardon_auth` zone `5r/m`, `limit_req_status 429` |
| `infra/nginx/conf.d/cardon.vn.conf` | Exact/prefix **exempt** webhook+IPN; auth register/agent-register/login `limit_req`; `/api/` unchanged (no catch-all limit) |

### Exempt matrix (must stay unlimited)

- `= /api/v1/payments/webhooks/sepay`
- `^~ /api/v1/payments/webhook/`
- `^~ /api/v1/payments/ipn/`
- `/health`
- Partner vhost `/api/partner/` — **untouched**

### Not done in this draft

- Prod `nginx -s reload`
- Support-ticket nginx limit (prefer CF later / S2)
- Nest / payment / Turnstile / abuse changes

### Prod apply gate

Owner window + `docker exec cardon-prod-nginx nginx -t` after deploy mount + reload. Rollback = revert conf files + reload.

---

## 3. S1 — Origin firewall runbook (**DO NOT APPLY** without change window)

### Current (EG-2)

```
Default: deny (incoming)
22/tcp  ALLOW Anywhere (+v6)
80/tcp  ALLOW Anywhere (+v6)
443/tcp ALLOW Anywhere (+v6)
```

### Target

| Port | From |
|------|------|
| 80, 443 | Cloudflare IPv4 **and** IPv6 published ranges only |
| 22 | Ops allowlist only (recommend Tailscale CGNAT `100.64.0.0/10` + optional break-glass IP) — **never** leave 22 open if locking 80/443 without console access |

### Preconditions (mandatory)

1. EG-1: `cardon.vn` / `www` / `admin` / `partner` are **orange-cloud** (else site dies).  
2. Console/VNC or out-of-band access to VPS (Vultr).  
3. Snapshot / note current `ufw status numbered`.  
4. Prefer install **Tailscale first**, allow SSH from Tailscale, **then** remove `Anywhere` on 22.

### Suggested command outline (ops — verify CF lists at apply time)

```bash
# 1) Install Tailscale + login (break-glass before tightening SSH)
# 2) Backup
ufw status verbose > /root/ufw-backup-$(date +%Y%m%d).txt

# 3) Allow SSH from Tailscale BEFORE deleting Anywhere-22
ufw allow from 100.64.0.0/10 to any port 22 proto tcp comment 'Tailscale SSH'
# optional: ufw allow from <ops-public-ip> to any port 22

# 4) Cloudflare 80/443 — use current https://www.cloudflare.com/ips-v4 and ips-v6
#    (script or paste ranges; mirror Keyon/Yukvix pattern)

# 5) Delete Anywhere rules for 80/443/22 only after CF + Tailscale rules exist
# 6) ufw reload && ufw status verbose
```

### Verify

- Via `https://cardon.vn/health` (or site home) through CF → OK.  
- From non-CF IP to `https://ORIGIN_IP/` → timeout/refuse.  
- SSH via Tailscale → OK; public 22 preferably closed or allowlisted.  
- **No** live payment settlement test required for S1; sandbox webhook via public hostname still reaches CF→origin.

### Rollback

`ufw reset` from backup file / Vultr console restore previous allow Anywhere if lockout.

---

## 4. Slice readiness after this doc

| Slice | Status |
|-------|--------|
| S0 | Done |
| S1 | **Ready-for-apply** — full script + steps in `#38` / `scripts/security/w4-s1-ufw-cloudflare-only.sh` (chưa apply) |
| S2 | **Ready-for-apply draft** — CF Free expressions + Bot Fight decision in `#38` (chưa apply) |
| S3 | **Repo draft done**; prod reload BLOCKED until owner deploy window |
| S4 | **Checklist ready** in `#38` — mở sau S1–S3 apply |

**W5/W6:** not opened. Apply order: xem `#38` §0.
