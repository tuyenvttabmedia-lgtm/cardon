# 38 — W4 S1 / S2 / S4 Ready-for-Apply Pack

**Date:** 2026-11-09  
**Mode:** Pack sẵn sàng apply.  
**Update 2026-11-09:** **S1 + S2 + S3 APPLIED** — xem `#39`. S4 smoke cơ bản OK; sandbox webhook + 24h soak còn lại trước W4 ACCEPT.

Refs: `#34` plan · `#35` evidence · `#37` S3 nginx draft · `scripts/security/w4-s1-ufw-cloudflare-only.sh`

---

## 0. Apply order (khi owner mở cửa sổ)

```text
1) S1 ufw (Tailscale SSH trước → CF-only 80/443 → xóa Anywhere)
2) S2 CF Custom Rules (+ quyết định Bot Fight)
3) S3 deploy nginx conf + nginx -t + reload   ← repo đã draft ở #37
4) S4 soak checklist (sandbox webhook, auth, bypass origin)
```

Rollback từng lớp độc lập (xem §5).

---

## 1. S1 — Origin firewall (READY)

### 1.1 Mục tiêu

| Port | From |
|------|------|
| 80, 443 | Chỉ Cloudflare IPv4 + IPv6 (list public CF) |
| 22 | Tailscale `100.64.0.0/10` (+ v6 Tailscale) + optional break-glass IP |
| Khác | Giữ default deny |

### 1.2 Preconditions (bắt buộc trước apply)

- [ ] `cardon.vn` / `www` / `admin` / `partner` **orange-cloud**
- [ ] Vultr **console/VNC** sẵn sàng
- [ ] **Tailscale đã cài + login** trên Cardon VPS (hiện **chưa có** — EG-2)
- [ ] SSH qua Tailscale OK trước khi xóa `Anywhere` trên 22
- [ ] Backup: `ufw status verbose` → file

### 1.3 Script

`scripts/security/w4-s1-ufw-cloudflare-only.sh`

```bash
# On Cardon VPS (after Tailscale works):
export I_UNDERSTAND_LOCKOUT_RISK=yes
# optional: export BREAK_GLASS_IP=your.office.ip
bash scripts/security/w4-s1-ufw-cloudflare-only.sh
# Then manually: ufw status numbered → ufw delete N (Anywhere 22/80/443)
ufw reload && ufw status verbose
```

CF CIDR snapshot trong script: **2026-11-09** — refresh từ CF trước apply nếu đã lâu.

### 1.4 Verify S1

| Check | Expect |
|-------|--------|
| `https://cardon.vn` (via CF) | Site / health OK |
| `https://ORIGIN_IP/` từ IP không phải CF | Timeout / refuse |
| SSH Tailscale | OK |
| SSH public Anywhere | Fail (sau khi xóa rule) |
| `docker ps` ports | Vẫn chỉ nginx 80/443 trên host |

### 1.5 Status

**APPLIED 2026-11-09** — chi tiết `#39`.

---

## 2. S2 — Cloudflare rules (READY draft — Free + Bot Fight On)

### 2.1 Inventory giả định (owner / EG-1 PARTIAL)

| Item | Value |
|------|-------|
| Plan | **Free** |
| Custom / RL hiện có | **0** |
| Bot Fight | **On** |
| DNS | Proxied (orange) — xác nhận lại trước apply |

**Free plan note:** Advanced **Rate Limiting** thường **không** có trên Free → auth RL dựa vào **nginx S3** + W2 Redis. Custom Rules: giữ ≤5 rule v1.

### 2.2 Rule set v1 (thứ tự ưu tiên cao → thấp)

Tạo trong **Security → WAF → Custom rules** (hoặc Rules → Custom rules).  
Action names theo UI (Skip / Managed Challenge).

#### Rule 1 — `w4-skip-payments` (Highest)

**Expression:**

```txt
(http.request.uri.path eq "/api/v1/payments/webhooks/sepay")
or (starts_with(http.request.uri.path, "/api/v1/payments/webhook/"))
or (starts_with(http.request.uri.path, "/api/v1/payments/ipn/"))
```

**Action:** **Skip**  
Skip components (chọn tối đa UI cho phép trên Free): Custom Rules còn lại, WAF Managed (nếu có), **Bot Fight** / Super Bot Fight nếu checkbox có.

**Why:** SePay / MegaPay / PayPal / eSIM IPN = non-browser; Bot Fight On dễ làm gãy callback.

#### Rule 2 — `w4-skip-partner-api`

```txt
starts_with(http.request.uri.path, "/api/partner/")
```

**Action:** **Skip** (Bot Fight + browser challenge components).

#### Rule 3 — `w4-skip-health`

```txt
(http.request.uri.path eq "/health")
or (http.request.uri.path eq "/api/v1/health")
```

**Action:** **Skip** (optional nhưng khuyến nghị).

#### Rule 4 — `w4-challenge-register`

```txt
(http.request.method eq "POST")
and (
  (http.request.uri.path eq "/api/v1/auth/register")
  or (http.request.uri.path eq "/api/v1/auth/agent-register")
)
```

**Action:** **Managed Challenge** (không Block cứng v1 — CGNAT VN).

#### Rule 5 — `w4-challenge-login` (optional v1)

```txt
(http.request.method eq "POST")
and (http.request.uri.path eq "/api/v1/auth/login")
```

**Action:** **Managed Challenge**  
Nếu hết slot Free (5 rules) → **defer**, dựa nginx `limit_req` login (S3).

### 2.3 Không làm (v1)

- Global challenge `/api/*`
- Hard block `POST /api/v1/orders`
- Super Bot Fight aggressive
- I'm Under Attack
- CF Rate Limiting (nếu plan Free không hỗ trợ)

### 2.4 Bot Fight decision (owner — trước/ khi apply S2)

| Option | Khi nào |
|--------|---------|
| **A. Tắt Bot Fight** | An toàn nhất cho webhook machine clients nếu Skip Bot Fight không khả dụng trên Free |
| **B. Giữ On + Rule 1 Skip Bot Fight** | Chỉ khi UI Skip thực sự bỏ qua Bot Fight cho path payment |
| **C. Giữ On không Skip được** | **Không recommend** — rủi ro EG-6 payment |

Khuyến nghị plan: apply Rule 1–4 → test sandbox webhook → nếu vẫn challenge/block payment → **Option A**.

### 2.5 Support ticket CF RL

**Defer** (nginx/W2 đủ tạm). Không chiếm slot Free.

### 2.6 Status

**APPLIED 2026-11-09** (owner Dashboard) — 4 rules Active; chi tiết `#39`.

---

## 3. S4 — Soak / nghiệm thu checklist (READY)

Chạy **sau** S1+S2+S3 apply. Không flood; không settle payment prod thật trừ khi owner approve sandbox.

### 3.1 Automated (repo — trước/sau S3 deploy)

```bash
# từ root monorepo — subset W1–W3 guardrails
npm test -- --testPathPattern="payment-skip-throttle|turnstile-scope|order-create-unchanged|abuse-rate-limit|email-policy" 
```

(Adjust runner theo package scripts hiện có.)

### 3.2 Edge / origin

| # | Case | Expect | Pass? |
|---|------|--------|-------|
| 1 | `https://cardon.vn` home | 200 | ☐ |
| 2 | Health qua hostname CF | 200 | ☐ |
| 3 | HTTPS thẳng ORIGIN_IP | Fail/timeout | ☐ |
| 4 | SSH Tailscale | OK | ☐ |
| 5 | `ufw status` 80/443 | Chỉ CF CIDR | ☐ |
| 6 | nginx `limit_req` zones loaded | `nginx -T` có `cardon_auth` + IPv6 real_ip | ☐ |

### 3.3 Auth / abuse (không phá)

| # | Case | Expect | Pass? |
|---|------|--------|-------|
| 7 | Register / agent-register 1 lần sạch | OK hoặc challenge hợp lệ | ☐ |
| 8 | Burst register (vài lần) | Challenge / 429 — không 5xx hàng loạt | ☐ |
| 9 | Login bình thường | OK | ☐ |
| 10 | VN mobile spot-check | Usable; ghi ASN nếu challenge | ☐ |

### 3.4 Payments (sandbox only)

| # | Case | Expect | Pass? |
|---|------|--------|-------|
| 11 | SePay webhook path + alias `/webhooks/sepay` | 2xx valid sig | ☐ |
| 12 | MegaPay webhook | 2xx sandbox | ☐ |
| 13 | PayPal webhook | 2xx sandbox | ☐ |
| 14 | eSIM IPN path trên apex (nếu dùng) | 2xx valid secret | ☐ |
| 15 | CF Security Events: payment path | Không challenge/block hàng loạt | ☐ |

### 3.5 Partner / checkout invariant

| # | Case | Expect | Pass? |
|---|------|--------|-------|
| 16 | Agent API `/api/partner/` key call | Không HTML challenge | ☐ |
| 17 | `POST /orders` guest/customer | Hành vi app **không** đổi (không hard edge block mới) | ☐ |

### 3.6 Soak window

- Theo dõi **24h**: CF 403/429, nginx 429, gateway failure / PAID stuck.  
- Owner sign-off → W4 **ACCEPT**.

### 3.7 Status

**READY** (checklist). **Chưa mở soak** vì chưa apply.

---

## 4. Slice readiness summary

| Slice | Artifact | Apply? |
|-------|----------|--------|
| S0 | `#35` `#36` | Done |
| S1 | `#38` §1 + ufw script | **APPLIED** (`#39`) |
| S2 | `#38` §2 CF expressions | **APPLIED** (`#39`) |
| S3 | `#37` + `infra/nginx/**` | **APPLIED** (`#39`) |
| S4 | `#38` §3 checklist | Smoke OK; sandbox+24h còn |
| S5 | Optional XFF | Out of W4 done criteria |

**W4 done khi:** S1+S2+S3 applied + S4 checklist xanh + owner ACCEPT.

---

## 5. Rollback nhanh

| Layer | Action |
|-------|--------|
| S1 ufw | Restore từ `/root/ufw-backup-w4-s1-*.txt` / console: allow Anywhere 80/443/22 tạm |
| S2 CF | Disable/delete `w4-*` rules; Bot Fight về state cũ |
| S3 nginx | Git revert conf → `nginx -t` → reload |
| S4 | N/A |

---

## 6. Stop (slice này)

- [x] S1 executable script + preconditions  
- [x] S2 Free-compatible Custom Rules + Bot Fight decision  
- [x] S4 soak checklist  
- [x] **No** prod ufw / CF / nginx apply  
- [x] No W5/W6  

**DỪNG apply.** Chờ owner mở change window theo §0.
