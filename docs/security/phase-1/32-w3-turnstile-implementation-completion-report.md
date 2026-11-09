# 32 — W3 Turnstile implementation completion report (LOCAL)

**Status:** **ACCEPT W3 LOCAL** by owner (2026-11-08).  
**Mode:** LOCAL ONLY — no deploy, no staging enable, no production, no migration, no Cloudflare Dashboard changes, no commit.  
**Refs:** `30` audit, `31` plan; D1–D5 owner-approved.  
**Roadmap:** recorded in `22-security-implementation-roadmap.md` wave acceptance log.  
**Standing:** keep code in working tree; `TURNSTILE_ENABLED` stays default **false**; live Site Key/Secret / CF widget verification remains **NOT VERIFIED**; **do not start W4** until owner orders.

---

## Verdict

| Item | Result |
|------|--------|
| `POST /auth/register` | Turnstile → Abuse → business |
| `POST /auth/agent-register` | Turnstile → Abuse → business |
| `POST /account/support/tickets` | Turnstile → Abuse → business |
| D1 fail-closed CF errors | **Implemented** (503) |
| D2 no captcha on messages | **Honored** |
| D3 Redis replay (`cardon:captcha:used:`) | **Implemented** via abuse Redis `SET NX EX` |
| D4 order | **Implemented** |
| D5 Managed widget | **FE TurnstileField** |
| Default `TURNSTILE_ENABLED` | **false** (W1/W2 behavior unchanged) |
| Payment / orders / eSIM / webhooks | **No Turnstile** (guardrail tests) |
| Jest | **17 suites / 123 tests PASS** |

---

## 1. Files added / modified (W3 delta)

### Added

| File | Purpose |
|------|---------|
| `src/common/turnstile/turnstile.module.ts` | Global Nest module |
| `src/common/turnstile/turnstile.service.ts` | `verifyOrThrow` + siteverify + replay |
| `src/common/turnstile/turnstile.constants.ts` | Actions, prefixes, messages |
| `src/common/turnstile/index.ts` | Public exports |
| `src/common/turnstile/turnstile.service.spec.ts` | Unit cases 1–15 |
| `src/common/turnstile/turnstile-controller-order.spec.ts` | Controller order + no abuse on captcha fail |
| `src/common/turnstile/turnstile-scope.guardrail.spec.ts` | No Turnstile in payment/order |
| `apps/web/components/security/TurnstileField.tsx` | Managed widget + API error helpers |
| `docs/security/phase-1/32-w3-turnstile-implementation-completion-report.md` | This report |

### Modified

| File | Change |
|------|--------|
| `src/app.module.ts` | Import `TurnstileModule` |
| `src/config/configuration.ts` | `turnstile.*` block |
| `src/config/env.validation.ts` | `TURNSTILE_*` Joi |
| `src/common/abuse-rate-limit/abuse-rate-limit.service.ts` | `claimKeyOnce` (shared Redis) |
| `src/modules/auth/auth.controller.ts` | Captcha before abuse on register/agent-register |
| `src/modules/auth/dto/register.dto.ts` | optional `captchaToken` |
| `src/modules/auth/dto/agent-register.dto.ts` | optional `captchaToken` |
| `src/modules/support/controllers/support-account.controller.ts` | Captcha before abuse on create ticket |
| `src/modules/support/dto/support.dto.ts` | optional `captchaToken` on create |
| `src/modules/support/support-download.http-smoke.spec.ts` | Mock `TurnstileService` provider |
| `apps/web/app/register/RegisterPageClient.tsx` | Widget + token |
| `apps/web/app/dang-ky-dai-ly/AgentRegisterPageClient.tsx` | Widget + token |
| `apps/web/app/account/support/page.tsx` | Widget on **create ticket only** |
| `apps/web/services/api-client.ts` | `captchaToken` on payloads |
| `apps/web/types/api.ts` | `RegisterPayload.captchaToken` |
| `.env.example` | Empty placeholders |
| `.env.production.example` | Empty placeholders (`TURNSTILE_ENABLED=false`) |

**Note:** Working tree still contains prior W1/W2/W2-H files; they were not reverted.

---

## 2. Module design & request flow (after)

```text
Client (Managed Turnstile widget)
  → captchaToken in JSON body
  → Controller
       1) TurnstileService.verifyOrThrow({ token, remoteIp, expectedAction })
            - flag off → return
            - missing secret (enabled) → 503
            - missing/invalid/hostname/action/stale → 400
            - CF timeout/network/5xx → 503
            - success → SHA-256(token) → Redis SET NX EX cardon:captcha:used:{hash}
            - replay hit / Redis down (replay on) → 400 / 503
       2) AbuseRateLimitService.consumeOrThrow (...)   // W2 unchanged
       3) AuthService / AgentRegistration / SupportService  // W1 email inside register paths
```

**Actions:** `register` | `agent-register` | `support-ticket`.

**IP:** `extractClientIp(req)` only — no raw XFF parse.

---

## 3. Redis replay (D3)

| Property | Value |
|----------|-------|
| Connection | Same abuse Redis (`REDIS_ABUSE_URL` or `REDIS_URL`) via `AbuseRateLimitService.claimKeyOnce` |
| Key | `cardon:captcha:used:{sha256(token)}` |
| Op | `SET key 1 EX ttl NX` |
| Raw token stored? | **No** |
| Abuse namespace | Untouched (`cardon:abuse:*`) |
| Fail-closed | Redis error → 503 when replay enabled |
| When marked | **After** successful siteverify only |
| Disable | `TURNSTILE_REPLAY_ENABLED=false` |

---

## 4. Environment variables

| Variable | Default / note |
|----------|----------------|
| `TURNSTILE_ENABLED` | `false` unless `true` |
| `TURNSTILE_SECRET_KEY` | API only; empty in examples |
| `TURNSTILE_ALLOWED_HOSTNAMES` | CSV hostnames |
| `TURNSTILE_TIMEOUT_MS` | 4000 |
| `TURNSTILE_MAX_AGE_SEC` | 300 |
| `TURNSTILE_REPLAY_ENABLED` | on unless `false` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `WEB_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public; empty until owner provides |

**Owner has not supplied keys yet** — live CF verification **NOT VERIFIED**.

---

## 5. Test results

Command:

```text
npx jest --testPathPattern="turnstile|support-download.http-smoke|support-attachment-url|support-upload|support.service|abuse-rate-limit|payment-skip-throttle|order-create-unchanged|email-policy|auth-registration|agent-registration.email-policy|request-client.util|image-magic|auth-security.audit" --no-coverage
```

| Metric | Value |
|--------|-------|
| Suites | **17 passed** |
| Tests | **123 passed** |
| Failures | **0** |

### Turnstile unit coverage (service)

Flag off; missing token; success; success=false; hostname; action; stale ts; timeout; network; 5xx; missing secret; replay; Redis down; no token/secret in logs; no raw token in Redis key.

### Controller order

Register / agent-register / ticket: turnstile → abuse → business; captcha fail does **not** call abuse.

### Regression

W1 email + auth/agent registration; W2 abuse; support upload/ownership/HTTP smoke; payment SkipThrottle; order-create-unchanged; auth-security.audit; scope guardrail (payment + order controllers).

---

## 6. Frontend verification (code-level)

| Check | Status |
|-------|--------|
| Shared `TurnstileField` Managed mode | Implemented |
| Register / agent-register / create-ticket only | Implemented |
| No widget on message/upload | Confirmed |
| Unconfigured Site Key → clear amber notice, no fake widget/key | Implemented |
| Submit blocked when Site Key present and no token | Implemented |
| 400/503 captcha → reset + friendly message | Implemented |
| Desktop/mobile layout | Widget standard CF responsive; **visual NOT VERIFIED** without Site Key |
| Live CF challenge | **NOT VERIFIED** (no Site Key from owner) |

---

## 7. Not verified (blocked on owner keys / ops)

1. Live Cloudflare siteverify with real Site Key / Secret.  
2. Hostname allowlist against real widget hostnames.  
3. Staging/prod enable soak.  
4. Visual QA of widget on real devices.  
5. Cloudflare Dashboard widget `action` names must match (`register`, `agent-register`, `support-ticket`).

---

## 8. Residual risks

| Risk | Notes |
|------|-------|
| Flag on without FE site key | API rejects missing token; FE shows unconfigured — enable both together |
| Captcha farms | Still limited by W2 abuse + OPEN cap; W4 later |
| CF outage | Fail-closed 503 on guarded endpoints (D1) — disable flag to restore |
| Nest `@Throttle` still runs as guard before handler | Separate from W2; invalid captcha may still hit in-memory throttle (acceptable) |
| Admin/partner apps | No Turnstile (out of scope) |

---

## 9. Rollback

1. Set `TURNSTILE_ENABLED=false` (API).  
2. Clear or omit `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (optional FE hide).  
3. No DB migration.  
4. Replay keys expire via TTL.

---

## 10. Scope confirmations

- [x] W1 Email Policy unchanged  
- [x] W2 Abuse limiter logic unchanged (only added `claimKeyOnce`)  
- [x] Support upload/ownership unchanged  
- [x] No Turnstile on messages/upload/login/contact/orders  
- [x] No payment / SePay / MegaPay / PayPal / wallet / ledger / fulfillment / eSIM changes  
- [x] No webhook/IPN Turnstile  
- [x] No schema/migration  
- [x] No deploy / no prod flag enable  

---

## 11. Owner acceptance

**Decision:** ACCEPT W3 LOCAL (2026-11-08).

Confirmed by owner:

- Keep W1/W2/W3 source in working tree.  
- No commit / no staging or production deploy from this acceptance.  
- Do not enable `TURNSTILE_ENABLED` on production.  
- Do not change Cloudflare Dashboard or CF config.  
- Items blocked on missing Site Key/Secret remain **NOT VERIFIED**.  
- Do **not** start W4 or later waves until new owner instruction.

## 12. Stop

**W3 LOCAL accepted.** Waiting for next owner directive. No W4 work.
