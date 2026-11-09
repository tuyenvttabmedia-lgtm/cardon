# 26 — W2 Implementation plan (await owner scope approval)

**Status:** Plan only — **do not implement** until owner confirms § decisions + scope.  
**Depends on:** `25-w2-read-only-audit-report.md`  
**Wave:** Redis distributed abuse limits + Ticket/KYC/upload protection  
**Out of wave:** W3 Turnstile, W4 Cloudflare edge, W5 guest order, W6 detection/auto actions  
**Hard constraints:** no payment/wallet/ledger/fulfillment/eSIM business changes; no auto-suspend/ban/KYC reject; no retail global email verify; no BullMQ counters; `POST /orders` **not modified** in W2; no prod/deploy/migration unless owner approves index separately.

---

## 1. Goals

1. Shared Redis abuse counter module (`cardon:abuse:*`) with multi-key dimensions and per-route fail policy.  
2. Apply fail-**closed** limits to: register, agent-register, login (Redis-backed or dual), support ticket/message/upload, KYC submit/document upload.  
3. Business rules: max OPEN tickets; attachmentUrl prefix allowlist; KYC Roles + optional emailVerified gate; concurrent KYC harden without auto-reject.  
4. Soft upload hardening without breaking existing `/uploads/support/...` links.  
5. Isolate payment webhooks from Nest global throttle via `@SkipThrottle` (**if owner approves**).

---

## 2. Non-goals

- Turnstile / CAPTCHA (W3)  
- nginx `limit_req` / CF WAF rules (W4)  
- Guest order email deny-list or order create limiter wiring (W5)  
- Abuse score / watchlist / auto-suspend (W6)  
- Changing `emailVerifiedAt` for customers  
- Using BullMQ as counter storage  
- Schema migrations (default); optional composite index only with separate approval  

---

## 3. Architecture

```
HTTP → (existing ThrottlerGuard in-memory coarse)
     → AbuseRateLimitGuard / AbuseRateLimitService.consume(bucket, dims)
            → ioredis (dedicated client) EVAL Lua INCR+EXPIRE
            → prefix cardon:abuse:
     → Controller → Service (OPEN cap / KYC state / upload rules)

BullMQ → same Redis server, keys bull:*  (separate connection options)
eSIM lease → cardon:esim:* (untouched)
```

### 3.1 Module layout (new)

| Path | Role |
|------|------|
| `src/common/abuse-rate-limit/abuse-rate-limit.constants.ts` | Bucket names, default limits, key prefix |
| `src/common/abuse-rate-limit/abuse-rate-limit.redis.ts` | Client factory from `REDIS_URL` or `REDIS_ABUSE_URL` |
| `src/common/abuse-rate-limit/abuse-rate-limit.service.ts` | `consume()`, fail policy, metrics hooks |
| `src/common/abuse-rate-limit/abuse-rate-limit.guard.ts` | Optional Nest guard reading metadata |
| `src/common/abuse-rate-limit/abuse-rate-limit.decorator.ts` | `@AbuseLimit('ticket_create')` |
| `src/common/abuse-rate-limit/abuse-rate-limit.module.ts` | Global module |
| `src/common/abuse-rate-limit/*.spec.ts` | Unit + Redis mock / fail policy |

Prefer **service calls inside controllers/services** or a thin guard — multi-key + fail-open/closed is awkward with stock `@nestjs/throttler` Redis package alone. Keep existing `@Throttle` as coarse backup until Redis path proven.

### 3.2 Config / ENV

| ENV | Default | Meaning |
|-----|---------|---------|
| `ABUSE_RATE_LIMIT_ENABLED` | `true` (unset → on) | Master kill switch |
| `REDIS_ABUSE_URL` | fall back `REDIS_URL` | Optional isolation |
| `ABUSE_REDIS_COMMAND_TIMEOUT_MS` | `100` | Fail path trigger |
| Per-bucket `ABUSE_LIMIT_*` / `ABUSE_TTL_MS_*` | see matrix | Tunables |
| `SUPPORT_OPEN_CAP` | `5` | Max OPEN tickets / customer |
| `SUPPORT_OPEN_CAP_ENABLED` | `true` | Rollback flag |
| `KYC_EMAIL_VERIFIED_REQUIRED` | `true` (if owner OK) | Agent KYC gate |
| `ABUSE_METRIC_ORDERS_REDIS_FAIL` | n/a | Reserved for later orders |

`configuration.ts`: `abuseRateLimit: { enabled, redisUrl, ... }`.

### 3.3 Lua / concurrency

- Single script: INCR + conditional EXPIRE.  
- `consume` awaits all dimension keys (parallel `Promise.all`); if any `n > limit` → `429`.  
- On Redis error/timeout: throw `ServiceUnavailableException` for fail-closed buckets; for future orders fail-open log `abuse_redis_fail_open`.  
- Do **not** block event loop with retries > 1.

### 3.4 Trust proxy / IP

When implementing: `app.set('trust proxy', 1)` (or CF-appropriate) in `main.ts` **only if** owner approves — required for accurate IP behind nginx. Abuse IP dimension must call `extractClientIp`.

---

## 4. Endpoint → limit matrix (implement)

| Bucket | Route | Dimensions | Limit / TTL | Fail |
|--------|-------|------------|-------------|------|
| `auth_register` | `POST /auth/register` | IP, emailHash | 5 / 15m | closed |
| `auth_agent_register` | `POST /auth/agent-register` | IP, emailHash | 5 / 15m | closed |
| `auth_login` | `POST /auth/login` | IP | 5 / 15m | closed |
| `support_ticket_create` | `POST /account/support/tickets` | userId, IP | 3 / 1h | closed |
| `support_message` | `POST .../messages` | userId | 20 / 1h | closed |
| `support_upload` | `POST /account/support/upload` | userId | 10 / 1h | closed |
| `kyc_submit` | `POST /agents/kyc` | userId | 3 / 24h | closed |
| `kyc_document` | `POST /agents/me/kyc/documents` | userId | 20 / 24h | closed |
| *(deferred)* `order_create` | `POST /orders` | — | — | open | **Not wired in W2** |

---

## 5. Ticket / KYC / upload work items

### 5.1 Support

1. Before create: `COUNT` tickets where `customerId` + `status=OPEN`; if ≥ cap → `400`/`429` stable message.  
2. Rate-limit create/message/upload via abuse service.  
3. Pass `user.id` into upload service; optionally prefix filename `userId` **or** store sidecar log only (URL shape can stay compatible).  
4. Validate `attachmentUrl`: must be empty or start with `/uploads/support/` (no open redirects).  
5. Tighten MIME: consider dropping `image/gif` to align with CMS (owner confirm).  
6. Increase entropy: `randomBytes(16)` for new files (old URLs remain valid).

### 5.2 KYC

1. Add `@Roles(UserRole.AGENT)` + `RolesGuard` on `POST kyc`, `POST me/kyc/documents`, `GET me/kyc/documents/file` (if owner chooses 403).  
2. Optional: `emailVerifiedAt` required before submit/upload.  
3. Abuse rate limits on submit/upload.  
4. Concurrency: wrap submit in transaction with `SELECT … FOR UPDATE` on agent/kyc row **or** conditional update `WHERE status NOT IN (SUBMITTED, APPROVED)` — **no** auto reject by admin bot.  
5. Do not change APPROVED/REJECTED admin flows.

### 5.3 Upload public URL

**Default W2 proposal (soft):** rate limit + entropy + attachment allowlist + keep public static for compatibility.  
**Optional (owner):** authenticated download route mirroring KYC — larger FE change; can be W2.1.

---

## 6. Payment isolation work item (conditional)

If approved:

```ts
@SkipThrottle()
@Post('webhook/:gateway')
...
@SkipThrottle()
@Post('ipn/esim/sepay')
```

No changes to signature verification, queue enqueue, or fulfillment.  
**Do not** attach AbuseRateLimit to these routes.

---

## 7. Files to add / modify (expected)

### Add

- `src/common/abuse-rate-limit/**` (module + tests)  
- Possibly `src/modules/support/support-open-cap.ts` helper  
- Specs: support create OPEN cap; KYC roles/verify; abuse fail policy  

### Modify

- `src/config/configuration.ts`, `env.validation.ts`  
- `src/app.module.ts` — import AbuseRateLimitModule  
- `src/main.ts` — trust proxy **if approved**  
- `src/modules/auth/auth.controller.ts` / `auth.service.ts` — consume limits (login/register)  
- `src/modules/agent/services/agent-registration.service.ts` — consume on registerPublic  
- `src/modules/support/controllers/support-account.controller.ts`  
- `src/modules/support/services/support.service.ts`  
- `src/modules/support/services/support-upload.service.ts`  
- `src/modules/agent/controllers/agent.controller.ts`  
- `src/modules/agent/services/agent.service.ts` (+ kyc repo if conditional update)  
- `src/modules/payment/controllers/payment.controller.ts` — SkipThrottle only if approved  

### Explicitly do not modify

- `order.service` / create-order payment flow  
- Provider adapters, Airalo, ledger, wallet HOLD  
- eSIM fulfillment / lease logic (except not touching)  
- Prisma schema (unless owner approves index migration)  

---

## 8. Implementation sequence (after approval)

1. Abuse Redis module + unit tests (mock ioredis) + kill switch.  
2. Wire auth register / agent-register / login (fail-closed).  
3. Support OPEN cap + rate limits + attachmentUrl + upload entropy/user bind.  
4. KYC Roles / emailVerified / rate limits / submit concurrency.  
5. SkipThrottle webhooks (if approved).  
6. trust proxy (if approved).  
7. Regression suite from §9 + manual local checklist.  
8. Stop for W2 nghiệm thu — **no deploy**.

---

## 9. Test plan

### Unit

- Lua/counter: first hit sets TTL; over limit; multi-key any-exceed.  
- Redis error → closed vs (future) open.  
- OPEN cap boundary 5→6.  
- attachmentUrl allow/deny.  
- KYC Roles / unverified email.  
- W1 still rejects `@example.com`.  

### Integration / Jest existing

- `auth-registration`, `auth.service`, `auth-security.audit`  
- New support + agent KYC specs  
- Payment webhook specs still green; assert SkipThrottle present in source if added  

### Failure simulation

- Inject Redis disconnect in AbuseRateLimitService tests.  
- Confirm webhooks not calling abuse service (grep / unit).  

### Manual local

- Burst ticket create → 429/400.  
- Upload 11th file / hour → limited.  
- Old support image URL still 200.  
- SePay webhook fixture still 200 (staging/local).  

---

## 10. Rollback plan

1. `ABUSE_RATE_LIMIT_ENABLED=false` — all new Redis limits off.  
2. `SUPPORT_OPEN_CAP_ENABLED=false` — unlimited OPEN (legacy).  
3. `KYC_EMAIL_VERIFIED_REQUIRED=false` — if gate causes agent onboarding friction.  
4. Revert PR / files if needed — no DB migrate down.  
5. SkipThrottle revert only if proven harmful (should not be).  

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Redis blip blocks login/register | Short timeout; alert; kill switch; monitor |
| Shared Redis memory pressure | TTL everywhere; optional `REDIS_ABUSE_URL` DB index |
| CGNAT false positives on IP | userId/emailHash dimensions; tune limits |
| OPEN cap frustrates real users | ENV raise; staff can close tickets |
| Public support files remain readable | Soft harden W2; optional auth download later |
| Conditional KYC update changes race semantics | Specs for REJECTED resubmit still works |

---

## 12. Effort

- **M** ≈ 2–3 days local implementation + tests after scope lock.

---

## 13. Owner confirmation checklist (required before code)

- [ ] Accept audit `25` findings  
- [ ] Approve SkipThrottle on payment webhook/IPN (**Y/N**)  
- [ ] Approve `trust proxy` in `main.ts` (**Y/N**)  
- [ ] KYC `@Roles(AGENT)` (**Y/N**)  
- [ ] KYC `emailVerifiedAt` required (**Y/N**)  
- [ ] Support GIF drop (**Y/N**)  
- [ ] Soft public upload vs auth download (**soft / auth**)  
- [ ] Confirm **no** `POST /orders` wiring in W2  
- [ ] Confirm no schema migration in W2  
- [ ] Confirm no auto-suspend / auto KYC reject  

---

## 14. Stop

After owner returns checklist → implement W2 on local only → diff + Jest + evidence → stop for W2 nghiệm thu before W3.
