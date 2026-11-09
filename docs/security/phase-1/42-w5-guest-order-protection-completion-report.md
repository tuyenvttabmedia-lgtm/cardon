# 42 — W5 Guest Order Protection — LOCAL Completion + Verification Report

**Date:** 2026-11-09  
**Mode:** LOCAL working tree only  
**Status:** **LOCAL VERIFIED** — chờ owner nghiệm thu W5 LOCAL.  
**Not done:** STAGING SOAK · prod deploy · commit  

**Refs:** Audit `#40` · Plan `#41` · W4 IP via `extractClientIp` + nginx real_ip  

---

## 0. Verdict

| Gate | Result |
|------|--------|
| LOCAL code + unit/guardrail regression | **PASS** (103 tests / 10 suites — command §6) |
| STAGING SOAK (live Turnstile keys, real checkout, gateway callbacks) | **NOT RUN** |
| Production deploy | **NOT DONE** (owner hold) |

**DỪNG** sau báo cáo này — không mở W6 / không deploy.

---

## 1. Rate limit `order_create` (20 / 15 phút)

### 1.1 Config

| Item | Evidence |
|------|----------|
| Limit / TTL | `resolveAbuseBucketConfig('order_create')` → limit **20**, ttl **900s** — `src/common/abuse-rate-limit/abuse-rate-limit.constants.ts` L84–90; ENV `ABUSE_LIMIT_ORDER_CREATE` / `ABUSE_TTL_ORDER_CREATE_SEC` |
| Consume API | `AbuseRateLimitService.consumeFailOpen` — `abuse-rate-limit.service.ts` L57–61, L64–109 |
| Wire-up | `OrderController.createOrder` L70–78 |

### 1.2 Đối tượng

| Caller | Dimensions passed | Redis keys |
|--------|-------------------|------------|
| **Guest** (`!user`) | `ip` + `email` → emailHash | `cardon:abuse:order_create:ip:{ip}` + `…:emailHash:{sha256[:32]}` |
| **Logged-in** | `userId` **only** (no IP, no email) | `cardon:abuse:order_create:userId:{id}` |

**Fix trong vòng verification:** bản draft đầu tiên còn truyền IP cho user đăng nhập → chung counter với guest (CGNAT). Đã sửa: auth **không** share IP key với guest (`order.controller.ts` L70–78). Spec: `order-guest-w5.spec.ts`, `order-w5-verification.spec.ts`.

### 1.3 Key material & multi-instance

- Prefix: `ABUSE_KEY_PREFIX = 'cardon:abuse:'` (`abuse-rate-limit.constants.ts` L1).  
- INCR+EXPIRE Lua atomic — shared Redis ⇒ **mọi API replica dùng chung counter**.  
- Evidence test: `order-w5-verification.spec.ts` (“Redis key format…”, “multi-instance shares…”).

### 1.4 IP extraction (sau W4)

- Controller: `extractClientIp(req)` — `request-client.util.ts` L9–14 (`req.ip` / trust proxy; **không** parse raw XFF).  
- Prod nginx: CF `real_ip_header CF-Connecting-IP` + IPv4/IPv6 `set_real_ip_from` (W4 S3).  
- Abuse key IP = client sau CF→nginx→Express trust hops=1.

### 1.5 Ảnh hưởng logged-in checkout

- Turnstile / email policy: **skip** khi có JWT user.  
- Abuse: chỉ `userId` 20/15m — guest spam IP **không** 429 user đăng nhập.  
- Residual: user đơn lẻ vẫn có thể 429 nếu **chính họ** tạo >20 đơn / 15 phút (cố ý).

---

## 2. Turnstile (guest-order)

### 2.1 Backend checks (`TurnstileService.verifyOrThrow`)

| Check | Behavior | File |
|-------|----------|------|
| Flag off | No-op | `turnstile.service.ts` L51–52 |
| Missing secret (enabled) | **503** misconfigured | L54–58 |
| Missing/empty token | **400** | L60–64 |
| Siteverify `success` | Must `true` else 400 | L125–128 |
| Hostname allowlist | If `TURNSTILE_ALLOWED_HOSTNAMES` set → must match | L130–137 |
| Action | Guest path expects **`guest-order`** | Controller L58–62; constant L10 |
| Expiry | `challenge_ts` vs `maxAgeSec` (default 300) | L147–162 |
| Replay | SHA-256 token → `cardon:captcha:used:{hash}` SET NX | L173–198 |

### 2.2 Direct API (không chỉ widget)

Khi `TURNSTILE_ENABLED=true`, `POST /orders` guest **không** token / token sai / action≠`guest-order` / replay → fail ở service **trước** `orderService.createOrder` (controller order: turnstile → email → abuse → create). FE widget chỉ cung cấp token; enforcement ở API.

### 2.3 Secrets / token leakage

- Redis key = hash, không raw token (`turnstile.service.spec.ts` #15).  
- Logs không chứa token/secret (`#14`).  
- Secret chỉ gửi body form tới Cloudflare siteverify (HTTPS).

### 2.4 Tests

`turnstile.service.spec.ts` (incl. guest-order action #6b), `turnstile-controller-order.spec.ts`, `turnstile-scope.guardrail.spec.ts`, `order-guest-w5` missing-token path.

---

## 3. Failure policy

| Condition | Turnstile (enabled) | Abuse `order_create` |
|-----------|---------------------|----------------------|
| Siteverify timeout / network | **503** unavailable | — |
| Cloudflare HTTP 5xx | **503** | — |
| Cloudflare 4xx siteverify | **400** failed | — |
| Missing Secret (enabled) | **503** misconfigured | — |
| Missing Site Key (FE only) | Widget warning; API vẫn enforce nếu enabled+secret | — |
| Redis down (replay) | **503** (fail-closed) | — |
| Redis down (abuse counter) | — | **Fail-open** (log + allow) |
| Over limit | — | **429** |

**Phân biệt:** Redis fail-open **chỉ** abuse counter checkout; Turnstile / replay Redis vẫn fail-closed khi captcha bật.

### Feature flags (rollback độc lập)

| Flag | Default | Effect |
|------|---------|--------|
| `TURNSTILE_ENABLED` | `false` (must `=== 'true'`) | Tắt toàn bộ captcha verify |
| `TURNSTILE_REPLAY_ENABLED` | on unless `false` | Tắt replay store |
| `ABUSE_RATE_LIMIT_ENABLED` | on unless `false` | Tắt mọi abuse buckets |
| `EMAIL_POLICY_ENABLED` | on unless false/0/off/no | Tắt deny-list |

Config: `src/config/configuration.ts` L53–77.

---

## 4. Email policy (guest)

| Item | Evidence |
|------|----------|
| Same API as W1 | `emailPolicy.assertRegistrationEmailAllowed(guestEmail)` — controller L67 |
| Normalization | `normalizeEmailAddress` trim+lower — `email-policy.ts` L46–48 |
| Reserved | `example.com` / `.org` / `.net` (+ list) — `email-policy.constants.ts` L11–25 |
| Disposable | curated list — same constants |
| Logged-in | **Không** gọi email policy trên create (chỉ `isGuest`) |

Tests: `email-policy.spec.ts` + `order-w5-verification` reserved/disposable asserts + `order-guest-w5` reserved reject.

---

## 5. Regression matrix

| Case | How verified | Result |
|------|--------------|--------|
| Guest checkout path (controller) | `order-guest-w5.spec.ts` | PASS |
| Logged-in skips captcha/email; abuse userId-only | same + verification spec | PASS |
| Turnstile valid / invalid / missing / replay / stale / hostname / action | `turnstile.service.spec.ts` | PASS |
| Rate limit over → 429 | abuse + order-guest-w5 | PASS |
| Redis abuse fail-open | `abuse-rate-limit.service.spec.ts` consumeFailOpen | PASS |
| Order service guest/auth create (business) | `order.service.spec.ts` | PASS |
| Payment SkipThrottle webhook/IPN; no Abuse/Turnstile | `payment-skip-throttle.spec.ts` + verification | PASS |
| W5 scope guardrails | `order-create-unchanged.w2.spec.ts`, `turnstile-scope.guardrail.spec.ts` | PASS |
| Live SePay/MegaPay/PayPal HTTP / fulfillment E2E | **Not executed** (LOCAL unit only; no payment code changes) | **STAGING SOAK pending** |
| Live guest/logged-in browser checkout | **Not executed** | **STAGING SOAK pending** |

**Payment implementation:** không sửa trong W5.

---

## 6. Test command + counts

```bash
npx jest src/modules/order/order-guest-w5.spec.ts \
  src/modules/order/order-w5-verification.spec.ts \
  src/modules/order/order-create-unchanged.w2.spec.ts \
  src/common/turnstile/turnstile.service.spec.ts \
  src/common/turnstile/turnstile-scope.guardrail.spec.ts \
  src/common/turnstile/turnstile-controller-order.spec.ts \
  src/common/abuse-rate-limit/abuse-rate-limit.service.spec.ts \
  src/modules/payment/payment-skip-throttle.spec.ts \
  src/common/email-policy/email-policy.spec.ts \
  src/modules/order/order.service.spec.ts \
  --runInBand
```

**Result (2026-11-09):** **10 suites PASS · 103 tests PASS · 0 FAIL**

---

## 7. Files touched (W5 LOCAL)

| Path | Role |
|------|------|
| `src/modules/order/controllers/order.controller.ts` | Guest Turnstile + email + fail-open abuse |
| `src/modules/order/dto/create-order.dto.ts` | `captchaToken?` |
| `src/common/abuse-rate-limit/*` | `order_create` + `consumeFailOpen` |
| `src/common/turnstile/turnstile.constants.ts` | `guest-order` |
| `apps/web/app/checkout/CheckoutPageClient.tsx` | Guest widget |
| `apps/web/types/api.ts` | `CreateOrderPayload.captchaToken` |
| Specs | `order-guest-w5`, `order-w5-verification`, updated guardrails |

---

## 8. Giới hạn còn lại (trước ACCEPT / soak)

1. **STAGING SOAK chưa chạy** — live Site Key/Secret, guest UI, logged-in shell, sandbox webhooks.  
2. **Turnstile default OFF** — LOCAL PASS với flag off = no captcha enforcement until enable.  
3. **Guest CGNAT** — nhiều guest cùng IP vẫn share IP counter (chấp nhận; auth đã tách).  
4. **Hostname allowlist** — nếu `TURNSTILE_ALLOWED_HOSTNAMES` trống, skip check hostname (config-dependent).  
5. **Không** CF Custom Rule trên `POST /orders` (cố ý — tránh challenge checkout).  

---

## 9. Admin Turnstile (KeyOn-style)

| Item | Path / behavior |
|------|-----------------|
| UI | Admin → **Cấu hình → Turnstile** (`/configuration/turnstile`) |
| API | `GET/PUT /admin/settings/turnstile` — secret AES in DB (`settings.security.turnstile`) |
| Public site key | `GET /public/turnstile` → `{ enabled, siteKey }` (never secret) |
| Resolve | DB fields win when present; ENV = fallback |
| Enable | Checkbox trên admin (= runtime `enabled`); không bắt buộc sửa `.env` trên VPS |

Owner paste Site Key + Secret từ Cloudflare Turnstile widget → Save → bật → FE nhận site key qua public API.

---

## 10. Owner nghiệm thu checklist

- [ ] Đọc `#40` `#41` `#42` — đồng ý LOCAL VERIFIED  
- [ ] Chấp nhận residual §8  
- [ ] (Sau ACCEPT) Staging: nhập Turnstile trên admin + soak checkout/gateway  
- [ ] Prod bundle chỉ khi owner order riêng  

**DỪNG. Chờ ACCEPT W5 LOCAL.**
