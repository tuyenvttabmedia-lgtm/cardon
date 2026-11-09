# 36 — W4 Evidence Pack Gap Analysis (READ-ONLY)

**Purpose:** Map what evidence already exists in the repository / local environment versus what production evidence the owner must still supply to close EG-1…EG-6.  
**Basis:** Owner-accepted `33`, `34`, `35`.  
**Mode:** READ-ONLY gap analysis — **no Implementation**, no S1/S2/S3 open.  
**Date:** 2026-11-08

---

## 1. Mục tiêu và phạm vi

### Mục tiêu

1. Đối chiếu bằng chứng hiện có với từng Evidence Gate trong `#35`.  
2. Phân tách rõ: **thiết kế repo** / **local runtime** / **production live**.  
3. Đưa checklist cụ thể để chủ hệ thống thu thập Evidence Pack còn thiếu.  
4. Đánh giá điều kiện mở S1, S2, S3 — giữ **BLOCKED** nếu thiếu bằng chứng production.

### Phạm vi được phép (đã tuân thủ)

- Chỉ đọc source, Compose, Nginx files, tài liệu repo, và (nếu có) quan sát local không thay đổi trạng thái.  
- Không sửa `#22`, `#33`, `#34`, `#35`, W1–W3, source, Cloudflare, firewall, ENV, DB, Docker runtime.  
- Không kết luận production **PASS** chỉ từ repo/local.

### Deliverable

Chỉ file này: `docs/security/phase-1/36-w4-evidence-pack-gap-analysis.md`.

---

## 2. Bằng chứng hiện có

### 2.1 Repository — Cloudflare / edge design (không phải live Dashboard)

| Item | Location | What it proves | What it does **not** prove |
|------|----------|----------------|----------------------------|
| Edge design intent | `docs/security/phase-1/20-edge-security-design.md` | Desired CF/nginx posture | Live WAF/Bot Fight/RL |
| Launch CF checklist (unchecked) | `launch/PRODUCTION_CHECKLIST.md` §6.1–6.11 | Planned ops tasks | Current Dashboard state |
| Zone / tunnel historical notes | `docs/esim/phase-2b4a…2b4d*.md` (2026-11-06) | Past work on zone `cardon.vn`, CNAME `ipn-sandbox.cardon.vn` → tunnel | Today’s proxy flags, WAF rules, connector health |
| Audit EG status | `docs/security/phase-1/33-…`, `35-…` | Prior NOT VERIFIED/PARTIAL | New live evidence |

**Confidence for production CF:** **Low** (historical/docs only).

### 2.2 Repository — Nginx (production-oriented tree)

| Item | Location | Observation |
|------|----------|-------------|
| Main nginx | `infra/nginx/nginx.conf` | Upstreams `api/web/partner/admin`; includes `conf.d/*.conf`; **no** `limit_req_zone` |
| CF real_ip | `infra/nginx/conf.d/00-cloudflare-real-ip.conf` | IPv4 `set_real_ip_from` list; `real_ip_header CF-Connecting-IP`; `real_ip_recursive on`; **no IPv6** ranges; cites ips-v4 |
| Customer vhost | `infra/nginx/conf.d/cardon.vn.conf` | `location = /api/v1/payments/webhooks/sepay` → alias webhook; `/api/` catch-all; `/health`; uploads include |
| Admin / partner | `infra/nginx/conf.d/admin.cardon.vn.conf`, `partner.cardon.vn.conf` | `/api/` or `/api/v1/` + `/api/partner/`; no limit_req |
| Proxy headers | `infra/nginx/conf.d/snippets/proxy-headers.conf` | `X-Real-IP $remote_addr`; `X-Forwarded-For $proxy_add_x_forwarded_for` |
| Uploads cache | `infra/nginx/conf.d/snippets/uploads-proxy.conf` | `Cache-Control public` 7d |
| `limit_req` / `limit_conn` | Entire `infra/nginx/**` | **Absent** |

**Confidence:** **High** for “files in git”; **does not** equal production runtime (`#35` EG-3).

### 2.3 Repository — Docker Compose (design declaration)

| Item | Location | Observation |
|------|----------|-------------|
| Prod nginx publish | `docker-compose.production.yml` L307–319 | Host `80:80`, `443:443`; mounts `./infra/nginx/nginx.conf`, `./infra/nginx/conf.d`, ssl |
| API publish | same file ~L160 `expose: "3000"` | Internal expose — **design intent** not host-publish |
| Web/partner/admin | `expose` only in prod compose pattern | Design isolation |

**Confidence:** **Medium** as intended topology; **not** firewall/SG proof (`#35` EG-2).

### 2.4 Repository — Payment / IPN / trust (backend)

| Item | Location | Observation |
|------|----------|-------------|
| Agent/retail webhook | `src/modules/payment/controllers/payment.controller.ts` L78–80 | `POST webhook/:gateway` + `@SkipThrottle` + `@Public` |
| eSIM IPN | same file L67–75 | `POST ipn/esim/sepay` + `@SkipThrottle` + `@Public` |
| No Abuse on payment controller | `src/modules/payment/payment-skip-throttle.spec.ts` | Asserts no `AbuseRateLimit` import |
| No Turnstile on payment | W3 guardrail `src/common/turnstile/turnstile-scope.guardrail.spec.ts` | Payment controller must not import Turnstile |
| MegaPay / SePay / PayPal | Same `:gateway` param; providers under `src/modules/payment/providers/**` | Backend callbacks exist; signature verify in providers/services |
| SePay wallet vs eSIM IPN | `docs/esim/phase-2b5a-sepay-sandbox-merchant-readiness.md` | Explicitly separate: webhook balance vs IPN PG |
| Trust hops default | `src/config/configuration.ts` L44; `src/main.ts` trust proxy | Default `TRUST_PROXY_HOPS=1` |
| Abuse IP helper | `src/common/utils/request-client.util.ts` | `extractClientIp` uses `req.ip` only |
| Raw XFF still used | `payment.controller.ts` L88–90; `agent-api-auth.guard.ts` L68–73; activity/audit interceptors | Logging/attribution paths |

**Confidence:** **High** for backend exemptions; **not** Cloudflare live exemption.

### 2.5 Repository — eSIM IPN hostname documentation

| Item | Location | Observation |
|------|----------|-------------|
| Candidate public URL | `docs/esim/phase-2b4d-cloudflare-tunnel-connection.md` | `https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` |
| Tunnel ≠ SePay registration | `docs/esim/phase-2b5a-…` | Tunnel does **not** register URL in SePay portal |
| IPN not from `APP_PUBLIC_URL` | `docs/esim/phase-2b3a-…`, `2b5a` | Merchant portal configures IPN |
| Local nginx IPN vhost | `infra/nginx/conf.d.local/10-esim-ipn-sandbox.conf` | `listen 8081`; exact IPN location |

**Confidence:** **Medium** for sandbox **candidate**; **NOT VERIFIED** that SePay Portal currently uses it.

### 2.6 Local environment (this developer host — not production)

| Item | Evidence | Note |
|------|----------|------|
| Local nginx mounts | Prior inspect: `infra/nginx/conf.d.local` → `/etc/nginx/conf.d` | **≠** prod mount `infra/nginx/conf.d` |
| No `cardon-prod-*` on host | Prior `docker ps` | Production not running here |
| Local cloudflared config (hostname only) | `%USERPROFILE%\.cloudflared\config.yml` ingress `ipn-sandbox.cardon.vn` → `127.0.0.1:8081` | Proves local tunnel **intent**; not live connector/SePay portal |

**Confidence for production:** **None** — local only.

---

## 3. Bằng chứng còn thiếu (Evidence Pack gaps)

| Gap ID | Needed for | Missing artifact |
|--------|------------|------------------|
| G1 | EG-1, EG-6 | Cloudflare Dashboard/API export: DNS proxy status (`cardon.vn`, `www`, `admin`, `partner`, IPN host); WAF Managed; Custom Rules (expression/action/order/enabled); Rate Limiting; Bot Fight/Super Bot Fight; Security Level + BIC; rules matching `payments`/`webhook`/`ipn` |
| G2 | EG-2 | VPS/cloud Security Group or ufw/nftables dump (redacted): sources allowed to TCP 80/443 (v4+v6); SSH rules; confirmation API/DB/Redis not WAN-exposed |
| G3 | EG-3 | Production read-only `nginx -T` (redact secrets/IPs) + confirmation of compose mounts actually used |
| G4 | EG-4 | Screenshot/text of SePay Portal IPN URL (sandbox and production if any) |
| G5 | EG-5 | Owner/ops confirmation of live path(s): retail CF→Nginx:443→API vs IPN Tunnel→:8081→API; any extra proxies |
| G6 | EG-6 | Subset of G1 focused on payment-path challenge/block; optional Security Events sample (redacted) |

No passwords, API keys, webhook secrets, or unredacted origin IPs should appear in the pack.

---

## 4. Bảng EG-1 đến EG-6 (gap view)

| EG | Status (unchanged from `#35` unless noted) | Present in repo/local | Still required from owner | Blocks |
|----|--------------------------------------------|------------------------|---------------------------|--------|
| **EG-1** | **NOT VERIFIED** | Design docs + historical esim CF notes only | G1 Dashboard/API export | S2 |
| **EG-2** | **CONFIRMED (weak)** 2026-11-09 | Prod ufw Anywhere 22/80/443; API not WAN-published | S1 apply window | S1 apply |
| **EG-3** | **CONFIRMED** 2026-11-09 | Prod `nginx -T` = IPv4 real_ip, no limit_req, webhook alias | None for baseline | S3 prod reload still needs window |
| **EG-4** | **CLOSED (owner)** | Apex webhooks; Tunnel unused prod | Optional portal shot | — |
| **EG-5** | **CONFIRMED** | CF→Nginx→API; no Tunnel | — | — |
| **EG-6** | **PARTIAL** (live CF) / backend exemptions **CONFIRMED** | Bot Fight On; 0 custom/RL (owner); SkipThrottle in app | G1/G6 fuller export before S2 | S2 |

---

## 5. Mức độ tin cậy từng lớp bằng chứng

| Evidence class | Trust for **production decisions** | Example |
|----------------|------------------------------------|---------|
| Nest source + unit specs | **High** for app behavior | SkipThrottle, no Turnstile on webhooks |
| Git nginx `conf.d/` | **High** for intended file content; **Low** for “what prod runs now” | real_ip IPv4-only, no limit_req |
| `docker-compose.production.yml` | **Medium** design; **Low** as firewall proof | 80/443 only on nginx |
| Esim phase-2b4 docs (Nov 6) | **Medium** historical; **Low** as “still true today” | Tunnel + IPN URL tests |
| Local Docker / local cloudflared | **High** for local; **Zero** for prod | `conf.d.local` mount |
| CF Dashboard (missing) | N/A | — |
| VPS firewall (missing) | N/A | — |

**Rule:** Repo/local may support **drafting** rules/configs after Implementation is opened; they **cannot** alone authorize production apply of S1–S3.

---

## 6. Hướng dẫn chủ hệ thống lấy bằng chứng còn thiếu

### 6.1 EG-1 / EG-6 — Cloudflare (≈15–30 phút)

1. Đăng nhập Cloudflare Dashboard → zone `cardon.vn` (hoặc zone thực tế).  
2. **DNS:** chụp danh sách bản ghi cho `cardon.vn`, `www`, `admin`, `partner`, hostname IPN — cột Proxy status (orange/grey).  
3. **Security → WAF:** Managed rules on/off + sensitivity.  
4. **Custom rules:** export/screenshot mỗi rule (expression, action, order, enabled).  
5. **Rate limiting rules:** tương tự.  
6. **Bots:** Bot Fight / Super Bot Fight mode.  
7. **Settings → Security Level** + Browser Integrity Check.  
8. Search rules/events for `payments`, `webhook`, `ipn`.  
9. Gửi file/ảnh **đã che** account id nếu cần; **không** gửi API token.

### 6.2 EG-2 — Origin firewall

1. Cloud provider Security Group **or** `sudo ufw status verbose` / `nft list ruleset` (read-only).  
2. Highlight rules for TCP 80, 443, 22 (and any management ports).  
3. Confirm whether sources are “Cloudflare only”, “0.0.0.0/0”, or mixed.  
4. Confirm IPv6 rules exist if AAAA/public v6 is used.  
5. Redact public origin IP to `/24` or `x.x.x.*` if required by policy.

### 6.3 EG-3 — Production Nginx

On the **production** host (ops), read-only:

```bash
docker exec cardon-prod-nginx nginx -T
# or equivalent container/service name
```

Also confirm mounts match:

- `docker-compose.production.yml` L317–319 (`nginx.conf`, `conf.d`, `ssl`).

Paste redacted output focusing on: `real_ip`, `set_real_ip_from`, `limit_req`, `location` for webhook/ipn/health/api/partner.

### 6.4 EG-4 — SePay Portal IPN

1. SePay merchant (sandbox and/or production) → Payment Gateway → IPN configuration.  
2. Copy the exact HTTPS URL SePay will call.  
3. Confirm Auth Type `SECRET_KEY` (per prior esim docs) — **do not** paste the secret value.  
4. State whether production uses the same host as sandbox or another host (e.g. apex).

### 6.5 EG-5 — Topology note (short written answer)

Answer in 5–10 lines:

1. Customer traffic: Cloudflare orange-cloud → VPS Nginx:443 → `api:3000`? Yes/No/Other.  
2. eSIM IPN: still Cloudflare Tunnel → host `:8081` → API? Yes/No/Other.  
3. Any extra reverse proxy (Traefik, another nginx, LB)?  
4. Is `TRUST_PROXY_HOPS` overridden in prod ENV? (name only / value if non-secret).

---

## 7. Điều kiện mở S1, S2, S3

| Slice | Minimum evidence to **consider** opening | Still required before **prod apply** | Current |
|-------|------------------------------------------|--------------------------------------|---------|
| **S0** | This gap analysis + `#35` | — | **Done** (docs) |
| **S1** Origin firewall | G2 done; Tailscale + orange-cloud + window | `#38` + ufw script | **Ready / chưa apply** |
| **S2** CF rules | Free expressions drafted; Bot Fight decision | `#38` §2 Dashboard | **Ready / chưa apply** |
| **S3** Nginx IPv6 real_ip + limit_req | Repo draft `#37`; G3 baseline done | Deploy + `nginx -t` + reload | **Draft done / prod BLOCKED** |
| **S4** Soak | After S1–S3 | `#38` §3 checklist | **Ready / chưa mở** |
| **S4** | After S1–S3 applied | Sandbox payment tests | Not opened |
| **S5** | Optional | — | Not opened |

**Explicit:** Completing `#36` does **not** open S1–S3. Owner must nghiệm thu gap analysis and supply Evidence Pack, then separately authorize Implementation slices.

---

## 8. Rủi ro nếu triển khai khi bằng chứng chưa đầy đủ

| Scenario | Risk | Severity |
|----------|------|----------|
| Add CF challenge on `/api/*` without EG-1/EG-6 | Break SePay/MegaPay/PayPal/IPN | **Critical** |
| Firewall “CF only” without EG-1 orange-cloud / wrong CF IP list | Total site outage / SSH lockout | **Critical** |
| Nginx `limit_req` on `/api/` catch-all without exempt locations | Throttle webhooks; false 429 | **High** |
| Skip list uses wrong IPN host (EG-4 incomplete) | eSIM PAID stuck | **High** |
| Assume local `conf.d.local` = prod `conf.d` | Wrong real_ip / missing alias | **High** |
| Change `TRUST_PROXY_HOPS` from code default without EG-5 | Abuse IP spoof or CF-node-as-client | **Medium** |
| Treat compose expose as firewall | Origin still public | **High** (false confidence) |

---

## 9. Mapping nhanh callback (backend vs CF)

| Callback | Backend path | Backend exemption | CF live exemption |
|----------|--------------|-------------------|-------------------|
| SePay agent wallet / retail webhook | `POST /api/v1/payments/webhook/sepay` (+ nginx alias `…/webhooks/sepay`) | SkipThrottle; signature | **NOT VERIFIED** |
| SePay eSIM IPN | `POST /api/v1/payments/ipn/esim/sepay` | SkipThrottle; X-Secret-Key verify | **NOT VERIFIED** |
| MegaPay | `POST /api/v1/payments/webhook/megapay` | SkipThrottle; notify verify | **NOT VERIFIED** |
| PayPal | `POST /api/v1/payments/webhook/paypal` | SkipThrottle; provider verify | **NOT VERIFIED** |
| Turnstile | N/A on these routes | Confirmed absent | N/A |
| AbuseRateLimit | N/A on payment controller | Confirmed absent | N/A |

---

## 10. Stop / acceptance checklist

- [x] Only `#36` created  
- [x] No edits to `#22`, `#33`, `#34`, `#35`, W1–W3, source, config, CF, firewall  
- [x] No production PASS claims from repo/local alone  
- [x] S1–S3 remain **BLOCKED**  
- [x] Owner Evidence Pack instructions listed (§6)  

**DỪNG.** Chờ chủ hệ thống nghiệm thu `#36` và cung cấp Evidence Pack (§3 / §6) trước khi mở Implementation slice nào.
