# 39 — W4 S1 + S3 Production Apply Report

**Date:** 2026-11-09  
**Mode:** Production apply (authorized after Tailscale join).  
**Host:** `cardon-vps` Tailscale `100.93.71.74` (origin public IP redacted in narrative).

---

## 1. S1 Origin firewall — APPLIED

| Item | Result |
|------|--------|
| Tailscale | `cardon-vps` online before apply |
| Backup | `/root/ufw-backup-w4-s1-20261109-103232.txt` |
| 80/443 | Cloudflare IPv4+IPv6 only (~44 CF rules) |
| 22 | Tailscale `100.64.0.0/10` + v6 `fd7a:115c:a1e0::/48` |
| Anywhere rules | **Removed** |

### Verify

| Check | Result |
|-------|--------|
| `https://cardon.vn` via CF | **200** |
| HTTPS to origin IP direct | **Fail** (connection closed) |
| SSH public origin | **Blocked/timeout** |
| SSH Tailscale | **OK** |

---

## 2. S3 Nginx — APPLIED

| File on `/opt/cardon/infra/nginx/conf.d/` | Action |
|------------------------------------------|--------|
| `00-cloudflare-real-ip.conf` | Updated (IPv6 CF ranges) |
| `01-rate-limit-zones.conf` | **Added** (`cardon_auth` 5r/m, status 429) |
| `cardon.vn.conf` | Updated (webhook/IPN exempt + auth `limit_req`) |

| Step | Result |
|------|--------|
| `nginx -t` | **OK** (http2 deprecation warns only) |
| `nginx -s reload` | **OK** |
| Live `nginx -T` | IPv6 `set_real_ip_from`, `limit_req zone=cardon_auth`, webhook/IPN `^~` present |

Backup dir: `/opt/cardon/infra/nginx/conf.d.bak-20261109-post-s3`

---

## 3. S4 smoke (immediate)

| Check | Result |
|-------|--------|
| `https://cardon.vn/` | 200 |
| `https://admin.cardon.vn/` | 200 |
| `https://partner.cardon.vn/` | 200 |
| `https://cardon.vn/health` | 200 |
| Origin bypass | Denied (S1) |

Sandbox payment webhook settlement tests: **not run** in this slice (need owner sandbox approve).

---

## 4. S2 Cloudflare — APPLIED (owner Dashboard 2026-11-09)

| Rule | Action | Status |
|------|--------|--------|
| `w4-skip-payments` | Skip (remaining custom + RL + managed + Super Bot Fight) | Active |
| `w4-skip-partner-api` | Skip (same components) | Active |
| `w4-skip-health` | Skip (same components) | Active |
| `w4-challenge-register` | Managed Challenge | Active — **conflict with Turnstile SPA**: change to **Skip** / disable after W3/W5 Turnstile live (POST XHR never reaches origin → false «session expired») |

CF warning “skip php2shell” on skip+managed: **expected** for payment/partner/health paths.

**Bot Fight (classic):** nếu Security → Bots vẫn On và UI Skip không cover Bot Fight (chỉ Super Bot Fight) → theo dõi webhook; false-positive thì tắt Bot Fight.

---

## 5. Remaining for W4 ACCEPT

- [x] S1 ufw  
- [x] S2 Custom Rules  
- [x] S3 nginx reload  
- [x] S4 smoke cơ bản (home/admin/health)  
- [ ] S4 sandbox webhook matrix (SePay/MegaPay/PayPal/IPN)  
- [ ] 24h soak (403/429 / gateway failures)  
- [ ] Owner ACCEPT  

**W5/W6:** not opened.
