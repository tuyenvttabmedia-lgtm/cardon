# 31 — W3 Turnstile Register/Ticket — IMPLEMENTATION PLAN

**Status:** Plan approved; implementation completed LOCAL (`32`); **ACCEPT W3 LOCAL** recorded 2026-11-08 on roadmap `22`.  
**Scope:** Cloudflare Turnstile on customer register, agent-register, and support ticket create.  
**Out of wave:** W4 Edge/WAF, W5 guest order, W6 detection, payment/wallet/ledger/fulfillment/eSIM, Agent distribution API.  
**Post-accept:** no prod Turnstile enable; no CF Dashboard change; W4 not opened.

**Refs:** `18-captcha-integration-design.md`, `30-w3-turnstile-read-only-audit.md`, W1/W2/W2-H reports.

---

## 1. Goals

1. Add **server-side** Turnstile verification as a human-proof layer on primary abuse entry points.  
2. Keep W1 Email Policy and W2 Redis abuse / OPEN cap / upload privacy **unchanged in strength**.  
3. Feature-flag rollout with safe local default **off**.  
4. Zero impact on payment webhooks, SePay IPN, ledger, fulfillment, eSIM workers, `POST /orders`.

---

## 2. Owner decisions (blockers before code)

| # | Question | Options | Plan default (pending owner) |
|---|----------|---------|------------------------------|
| D1 | CF outage / timeout on register & ticket | Fail-closed 503 vs fail-open | **Fail-closed** (doc 18) |
| D2 | Turnstile on support **messages** in W3 v1? | Yes / No | **No** (ticket create only) |
| D3 | Redis replay hash `cardon:captcha:used:*` | Yes / CF-only | **Yes** (defense-in-depth; reuse abuse Redis URL) |
| D4 | Order vs abuse limiter | Captcha before / after `consumeOrThrow` | **Before** consume (invalid tokens do not burn quota) |
| D5 | Widget mode | Managed / Invisible | **Managed** (a11y; doc 18) |
| D6 | Per-endpoint `action` names | Enforce / ignore if empty | Enforce when configured |
| D7 | Staging hostnames | List | Owner provides (e.g. staging + localhost) |
| D8 | Contact form Turnstile | Later wave / include | **Later** (not W3) |

Implementation must not start until D1–D5 answered or defaults explicitly accepted.

---

## 3. Target architecture

```text
[FE Widget] --token--> [API Controller]
                          │
                          ├─ ValidationPipe (DTO includes captchaToken when enabled path)
                          ├─ TurnstileService.verifyOrThrow({ token, ip, expectedAction })
                          │     ├─ if !TURNSTILE_ENABLED → return
                          │     ├─ if !secret → 503 misconfig
                          │     ├─ POST siteverify (timeout)
                          │     ├─ assert success, hostname, action?, challenge_ts
                          │     └─ optional Redis SET NX used hash TTL
                          ├─ AbuseRateLimitService.consumeOrThrow (...)   // W2 unchanged
                          └─ AuthService / AgentRegistration / SupportService  // W1 inside
```

**Rules:**

- Frontend only renders widget + passes token.  
- Backend is sole authority.  
- Never log token/secret.  
- Never call Turnstile from webhook/IPN/payment modules.

### NestJS fit (from audit)

- New module e.g. `src/common/turnstile/` (`TurnstileModule`, `TurnstileService`, constants, spec).  
- Use native `fetch` + `AbortSignal.timeout` (repo pattern).  
- Register in `AppModule`; inject into `AuthController` + `SupportAccountController` only.  
- Config keys in `configuration.ts` + optional Joi in `env.validation.ts`.

---

## 4. Endpoints in scope

| Endpoint | Token field | Expected action (suggested) | When enabled |
|----------|-------------|-----------------------------|--------------|
| `POST /auth/register` | `captchaToken` (body) | `register` | Required |
| `POST /auth/agent-register` | `captchaToken` | `agent-register` | Required |
| `POST /account/support/tickets` | `captchaToken` | `support-ticket` | Required |

**Explicitly not in W3 code:**

- Support messages, upload, download  
- Login / forgot / reset (future)  
- `POST /orders`, contact, KYC, Agent API keys  
- Admin support reply  

---

## 5. Implementation steps (ordered)

### Step 0 — Prerequisites (ops, not code)

1. Owner creates Cloudflare Turnstile widget (Managed).  
2. Record Site Key + Secret Key in secret store (not git).  
3. Confirm allowed hostnames for prod/staging/local.

### Step 1 — API: Turnstile module (LOCAL)

1. Add `TurnstileService.verifyOrThrow`.  
2. Wire config: `TURNSTILE_ENABLED` default false.  
3. Unit tests with mocked `fetch`.  
4. **No** payment module imports.

### Step 2 — API: DTO + controllers

1. Extend `RegisterDto`, `AgentRegisterDto`, `CreateSupportTicketDto` with optional/conditional `captchaToken`  
   - When enabled: treat missing/empty as 400 inside service (avoid breaking ValidationPipe when flag off).  
   - Preferred pattern: always accept optional string `@IsOptional @IsString @MaxLength(2048)`; service enforces when flag on.  
2. Call `verifyOrThrow` **before** `abuseRateLimit.consumeOrThrow`.  
3. Pass `extractClientIp(req)` as `remoteip` to siteverify (optional but recommended).

### Step 3 — FE web

1. Env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public).  
2. Shared component e.g. `components/security/TurnstileField.tsx` (script load + callback).  
3. Wire into:
   - `RegisterPageClient.tsx`
   - `AgentRegisterPageClient.tsx`
   - `account/support/page.tsx` (create ticket form only)
4. Extend `RegisterPayload` / api-client bodies with `captchaToken`.  
5. UX: disable submit until token; on API 400 captcha → reset widget; on 503 → friendly retry.  
6. If site key empty / flag conceptually off: hide widget; API flag must match (document deploy order: API flag on only after FE key present).

### Step 4 — Tests & regression

See §7.

### Step 5 — Docs

Completion report `32-w3-…` (after implement; **not now**).

### Step 6 — Deploy (separate owner approve)

Not part of audit/plan acceptance. Staging soak before prod. Rollback via `TURNSTILE_ENABLED=false`.

---

## 6. Environment variables (to add at implement time)

| Name | App | Required when enabled | Example shape (placeholder only) |
|------|-----|----------------------|----------------------------------|
| `TURNSTILE_ENABLED` | API | yes | `false` / `true` |
| `TURNSTILE_SECRET_KEY` | API | yes if enabled | *(owner secret)* |
| `TURNSTILE_ALLOWED_HOSTNAMES` | API | recommended | `cardon.vn,www.cardon.vn` |
| `TURNSTILE_TIMEOUT_MS` | API | optional | `4000` |
| `TURNSTILE_MAX_AGE_SEC` | API | optional | `300` |
| `TURNSTILE_REPLAY_ENABLED` | API | optional | `true` if D3=yes |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Web | for widget | *(owner site key)* |

Update `.env.example` / `.env.production.example` with **empty placeholders** only — never real secrets.  
Do **not** put secret in Next public env.

---

## 7. Test plan

### Unit (API)

| Case | Expect |
|------|--------|
| Flag off, no token | Business proceeds (existing register tests) |
| Flag on, missing token | 400 |
| Flag on, siteverify success | Proceed to abuse + business |
| Flag on, success=false | 400 |
| Hostname not allowlisted | 400 |
| Action mismatch | 400 |
| challenge_ts too old | 400 |
| fetch timeout | 503 |
| Secret missing + enabled | 503 |
| Replay second use (if Redis) | 400 |
| Token/secret never appear in logger spies | Pass |

### Controller / smoke (local fixtures)

| Case | Endpoint | Expect |
|------|----------|--------|
| No token | register / agent-register / ticket | 400 |
| Bad token | same | 400 |
| Valid mocked verify | same | Continues (may 429 if abuse mocked) |

### Regression (must stay green)

- W1: `email-policy`, `auth-registration`, `agent-registration.email-policy`  
- W2: `abuse-rate-limit`, support upload/ownership/http-smoke  
- `payment-skip-throttle` — **no** Turnstile import in payment controller  
- `order-create-unchanged.w2` — still no abuse/captcha on orders  
- Auth security audit throttle expectations still hold  

### FE manual (staging)

- Widget renders on 3 forms  
- Submit without solve blocked  
- Successful human solve registers / creates ticket  
- Mobile managed widget usable  

---

## 8. Error handling (implement contract)

Align with audit §9:

| Condition | HTTP | Body message (generic) |
|-----------|------|------------------------|
| Missing/invalid/expired/replay/hostname/action | 400 | `Captcha verification failed` (no CF detail leak) |
| CF timeout / network / 5xx | 503 | `Captcha service unavailable` |
| Misconfig (enabled, no secret) | 503 | Same or `Captcha misconfigured` (ops log only) |
| Flag off | — | Skip |

Internal logs: reason code enum only (`missing_token`, `siteverify_failed`, `hostname`, `timeout`, …) — **never** token/secret.

---

## 9. Compatibility checklist (W1/W2)

| Control | Plan action |
|---------|-------------|
| Email policy | Unchanged; still inside services after captcha+abuse |
| Abuse buckets | Unchanged limits; call **after** captcha |
| OPEN ticket cap | Unchanged |
| Support upload authz | Unchanged; no Turnstile |
| Webhook SkipThrottle | Guardrail test: payment module must not depend on TurnstileModule |
| Orders fail-open / no limiter | Do not add Turnstile to `POST /orders` |

---

## 10. Rollout sequence

1. Merge code with `TURNSTILE_ENABLED=false` (behavior = today).  
2. Staging: set keys + enable; soak register/ticket.  
3. Prod: deploy FE site key first (widget hidden if API off still OK), then API secret + enable.  
4. Monitor 400/503 captcha rates + register success rate.  
5. Rollback: disable flag (no redeploy required if ENV-only).

---

## 11. Rollback

1. `TURNSTILE_ENABLED=false`.  
2. Optionally remove/hide FE widget.  
3. No DB migration.  
4. Redis replay keys TTL-expire naturally if used.

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| CF outage blocks signup/support | Owner-approved fail-closed; status page / quick flag off |
| Hostname misconfig locks staging | Separate allowlist; include staging hosts before enable |
| FE/API flag skew | Runbook: enable API only after site key live |
| Attackers buy captcha farms | W2 rate limits + OPEN cap remain; W4 edge later |
| Accidental wiring to orders/webhooks | Code review + regression specs |
| Logging PII/token | Structured reason codes only |

---

## 13. Effort estimate

| Work | Estimate |
|------|----------|
| API module + controller/DTO wiring + tests | 1–1.5d |
| FE widget × 3 forms + api-client types | 0.5–1d |
| Staging soak + docs completion report | 0.5d |
| **Total** | **~2–3d** (matches roadmap M) |

---

## 14. Non-goals (hard stop)

- Cloudflare WAF / Bot Fight / Edge rate rules → **W4**  
- Guest `POST /orders` captcha → **W5**  
- Detection dashboard / auto-suspend → **W6**  
- Schema/migration  
- Changing payment, wallet, ledger, fulfillment, eSIM  
- Opening public `/uploads/support`  

---

## 15. Acceptance criteria (for future implement PR)

- [ ] Siteverify only on server  
- [ ] P0 endpoints gated when enabled  
- [ ] Flag off = pre-W3 behavior  
- [ ] W1/W2/payment/order regression green  
- [ ] No secrets in repo/logs/responses  
- [ ] Completion report written; owner nghiệm thu before prod enable  

---

## 16. Stop — planning complete

**Không implement Turnstile trong phase này.**  
Chờ chủ dự án nghiệm thu `30` + phê duyệt `31` (và trả lời D1–D5) rồi mới mở W3 Implementation.
