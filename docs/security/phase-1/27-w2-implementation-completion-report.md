# 27 — W2 Implementation completion report (LOCAL)

**Status:** Implemented on local working tree — **await owner nghiệm thu**. No prod/deploy/migration.  
**Refs:** `25`, `26`, owner W2 authorization.

---

## 1. Summary

W2 delivered:

- Redis abuse limiter (`cardon:abuse:*`, Lua INCR+TTL, multi-key, fail-closed → 503)
- Ticket rate limits + OPEN cap 5 (row lock, no migration)
- KYC `@Roles(AGENT)` + exclusive submit lock + rate limits (no `emailVerifiedAt` gate)
- Support uploads private; authenticated download for customer + admin; magic bytes; no GIF
- `@SkipThrottle` on payment webhook + eSIM SePay IPN
- Trust proxy hops + `extractClientIp` without blind XFF parse
- **POST `/orders` not wired** to abuse limiter

---

## 2. Files added / modified

### Added (API)

- `src/common/abuse-rate-limit/**`
- `src/common/utils/image-magic.util.ts` (+ spec)
- `src/common/utils/request-client.util.spec.ts`
- `src/modules/support/controllers/support-admin-files.controller.ts`
- `src/modules/support/services/support-upload.service.spec.ts`
- `src/modules/payment/payment-skip-throttle.spec.ts`
- `src/modules/order/order-create-unchanged.w2.spec.ts`
- `docs/security/phase-1/27-w2-implementation-completion-report.md`

### Modified (API)

- `src/app.module.ts`, `src/main.ts`, `src/config/configuration.ts`, `src/config/env.validation.ts`
- `src/common/utils/request-client.util.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/support/**` (constants, dto, repository, service, account controller, module)
- `src/modules/agent/controllers/agent.controller.ts`
- `src/modules/agent/services/agent.service.ts`
- `src/modules/agent/repositories/agent.repository.ts`
- `src/modules/agent/agent.service.spec.ts`
- `src/modules/payment/controllers/payment.controller.ts`

### Modified (FE — required for private attachments)

- `apps/web/services/api-client.ts`, `apps/web/app/account/support/page.tsx`
- `apps/admin/services/api-client.ts`, `apps/admin/app/support/tickets/page.tsx`

---

## 3. Jest report

```
Test Suites: 14 passed
Tests:       109 passed
```

Pattern covered: abuse-rate-limit, image-magic, request-client, support, payment-skip-throttle, order-create-unchanged W2, agent.service, auth-registration, email-policy, auth.service, auth-security.audit.

---

## 4. Security regression checklist

| Case | Result |
|------|--------|
| Atomic INCR + TTL Lua | Covered (unit) |
| Multi-dimension any-exceed → 429 | Pass |
| Redis error → 503 fail-closed | Pass |
| Flag off → no-op | Pass |
| OPEN cap exceeded | Pass |
| Attachment URL allowlist | Pass |
| MIME/magic spoof / GIF / oversized / traversal | Pass |
| XFF spoof ignored (req.ip only) | Pass |
| Webhook `@SkipThrottle` present; no AbuseRateLimit in payment | Pass |
| Order create no AbuseRateLimit | Pass |
| W1 email policy still green | Pass |
| KYC exclusive upsert path | Wired + agent.service tests updated |

---

## 5. Redis / performance impact

- Dedicated ioredis client (lazy), `maxRetriesPerRequest: 1`, command timeout default 100ms
- Prefix `cardon:abuse:` — not BullMQ; optional `REDIS_ABUSE_URL`
- Metrics: `getMetrics()` → `redisErrorCount`, `lastLatencyMs` (log on error)
- Expected: 1–3 Redis round-trips on guarded endpoints; fail-closed auth/ticket/KYC if Redis down

---

## 6. Rollback

| Control | Kill switch |
|---------|-------------|
| All abuse Redis limits | `ABUSE_RATE_LIMIT_ENABLED=false` |
| OPEN cap | `SUPPORT_OPEN_CAP_ENABLED=false` |
| Trust proxy hops | `TRUST_PROXY_HOPS=0` (local direct) |
| Code | Revert W2 files; re-enable public `/uploads/support` only if intentionally rolling back privacy |

No DB migration to roll back.

---

## 7. Remaining risks / notes

- Orphan support files never attached and **not** prefixed with `userId_` (legacy) are only downloadable if referenced on a ticket message.
- New files use `{userId}_{ts}_{hex}.ext` so uploader can download before attach.
- Admin downloads any existing support filename with `support.manage` (staff trust).
- Concurrent KYC uses `SELECT … FOR UPDATE` on `agents` — no unique partial index (would need migration; not done).
- Global Nest Throttler remains in-memory for non-skipped routes; abuse module is additive.
- FE must be deployed with API for attachment UX; old `<a href="/uploads/support/...">` will get 401 by design.

---

## 8. Stop

W2 local implementation complete. **Do not start W3** until owner accepts this report.
