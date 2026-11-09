# 25 — W2 Read-only audit report

**Program:** CardOn Security — Wave 2 (Redis rate limit + Ticket/KYC/upload protection)  
**Prerequisite:** W1 email deny-list **accepted** by owner (local).  
**Mode:** READ-ONLY — no source/DB/Redis/prod changes in this step.  
**Design refs:** `17-redis-rate-limit-design.md`, `19-ticket-kyc-upload-protection.md`, `20-edge-security-design.md`, `23-security-regression-test-plan.md`, `22-security-implementation-roadmap.md`.

**API prefix:** `api/v1` (`main.ts` global prefix). Routes below are relative to that prefix unless noted.

---

## 1. Executive summary

W2 is justified: Nest Throttler is **in-memory** and IP-centric; ticket/KYC/upload abuse paths lack dedicated limits and business caps; support uploads are **world-readable** under `/uploads/support/`. Payment/provider workers are **not** behind a custom abuse limiter today, but the **global** `ThrottlerGuard` (100/60s) **does** apply to public webhooks unless `@SkipThrottle` (only Agent API skips today).

`POST /orders` was audited for interaction only — **no W2 code change** recommended for order create (owner scope); fail-open design remains for a later wave / optional flag.

---

## 2. Findings by severity

### Critical

| ID | Finding | Evidence |
|----|---------|----------|
| C1 | Support screenshots are served as **public static files**; anyone with URL can read. Filename is time + 6 random bytes (guessable with effort / leak via ticket APIs to wrong parties if URL shared). | `main.ts` ~L68 `express.static(.../uploads)`; `support-upload.service.ts` L35 returns `/uploads/support/${filename}`; nginx `uploads-proxy.conf` caches public 7d |

### High

| ID | Finding | Evidence |
|----|---------|----------|
| H1 | Nest `ThrottlerModule` default **in-memory**; multi-instance ⇒ N× limit; no Redis storage. | `app.module.ts` L57–61, L114–116 `APP_GUARD` = `ThrottlerGuard` |
| H2 | Support ticket create / message / upload: **no** `@Throttle`, **no** OPEN cap, upload **not** bound to `userId`. | `support-account.controller.ts` L42–64; `support.service.ts` L22–46; `support-upload.service.ts` L13–35 |
| H3 | Global throttle **not** skipped on payment webhook/IPN — burst traffic can 429 gateways (100/60s shared). Agent API correctly uses `@SkipThrottle`. | `payment.controller.ts` L66–77 `@Public()` only; `agent-api.controller.ts` L27 `@SkipThrottle()` |
| H4 | Concurrent KYC submit race: status check then `upsertSubmitted` without row lock — dual SUBMITTED possible under parallel requests. | `agent.service.ts` L91–132 |

### Medium

| ID | Finding | Evidence |
|----|---------|----------|
| M1 | `POST /agents/kyc` and KYC document upload: class `JwtAuthGuard` only; **no** `@Roles(AGENT)`. Authz relies on `requireOwnAgent` → `NotFound` if no agent row (customer JWT cannot complete KYC, but probe surface + inconsistent 404 vs 403). | `agent.controller.ts` L37–38, L64–81; `agent.service.ts` L607–612 |
| M2 | Support `attachmentUrl` on messages: **no** prefix allowlist — arbitrary URL string persisted. | `support.service.ts` L59–77; controller L47–58 body untyped DTO |
| M3 | Support upload validates **client** `mimetype` + extension allowlist; **no** magic-byte sniff; GIF allowed (CMS KYC path blocks SVG more carefully). | `support-upload.service.ts` L17–25 vs `media-upload.security.ts` |
| M4 | No Express `trust proxy` in `main.ts`; IP for Nest Throttler/`req.ip` may be proxy hop. App order path uses `extractClientIp` (XFF first). Abuse limiter must use same helper + confirm nginx CF real_ip. | `main.ts` (no trust proxy); `request-client.util.ts` L3–12; `00-cloudflare-real-ip.conf` |
| M5 | `POST /orders` create: **no** dedicated `@Throttle` (guest lookups throttled). Interaction only for W2. | `order.controller.ts` L75–108 vs L125–157 |
| M6 | OPEN ticket count has indexes on `customerId` and `status` separately — no composite `(customerId, status)`; acceptable without migration for v1 COUNT. | `schema.prisma` SupportTicket L2699–2701 |

### Low

| ID | Finding | Evidence |
|----|---------|----------|
| L1 | Health Redis checks open **new** short-lived ioredis clients per probe (not shared pool). | `server-health.service.ts` L143–171 |
| L2 | KYC download via authenticated stream is stronger than support upload — good pattern to copy. | `agent.controller.ts` L84–100; path guard `resolveFilePath` L75–85 |
| L3 | Edge `limit_req` still absent (W4). | `infra/nginx/conf.d*` |

---

## 3. A — Redis / rate limit audit

### 3.1 Connections & lifecycle

| Consumer | How | Options | Notes |
|----------|-----|---------|-------|
| BullMQ | `QueueModule` `BullModule.forRootAsync` | `url: redis.url`, `maxRetriesPerRequest: null`, `enableReadyCheck: true`, `retryStrategy` capped 5s | `queue.module.ts` L52–62 — **shared Redis URL** with queues `payment_queue`, `provider_queue`, `esim_queue`, etc. (`queue.constants.ts`) |
| Health / server-health | Ephemeral `new Redis(url)` | `connectTimeout: 3000`, `maxRetriesPerRequest: 1`, `lazyConnect` | Quit in `finally` |
| eSIM GET lease | Prefix `cardon:esim:get-lease:` | Separate from Bull keyspace by prefix | `esim-get-lease.ts` |
| Nest Throttler | **No Redis** | In-process memory | Cannot share across API replicas |

**No** dedicated abuse Redis client/module exists today.

### 3.2 BullMQ coexistence risk

- Same `REDIS_URL` / logical DB 0 by default.  
- Bull keys typically `bull:*`; eSIM `cardon:esim:*`; proposed abuse `cardon:abuse:*`.  
- **Do not** store counters as Bull jobs.  
- Eviction: abuse keys must always have TTL; prefer not setting aggressive `allkeys-lru` without ops review.  
- Separate connection (second ioredis) for abuse recommended so `maxRetriesPerRequest` can be finite (e.g. 1–2) without fighting BullMQ’s `null` requirement.

### 3.3 Proposed atomic counter

Lua (preferred) or `INCR` + `EXPIRE` only when `INCR == 1`:

```
-- pseudo
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
```

- Key: `cardon:abuse:{bucket}:{dimension}:{id}`  
- Multi-dimension: evaluate IP + userId + emailHash independently; **any** over limit ⇒ reject.  
- Timeout: command timeout ~50–100ms; on error apply fail policy (below).  
- Race: Lua makes TTL set atomic with first increment.

### 3.4 IP / identity dimensions

| Dimension | Source | Caveat |
|-----------|--------|--------|
| IP | `extractClientIp(req)` | Relies on XFF / nginx CF real_ip; set `trust proxy` when wiring limiter |
| userId | JWT `user.id` | Ticket/KYC/authenticated |
| emailHash | SHA-256(normalized email) | Register / agent-register only |

---

## 4. B — Endpoint matrix (current → W2 proposal)

Legend — **Fail:** Redis down policy for **new** abuse limiter (not existing Nest Throttler).  
**Orders:** audit only — **do not implement** wire-up in W2 code per owner.

| Method + route | Controller (file:lines) | Service | AuthZ | Current limiter | Proposed dimensions | Proposed limit | Redis fail | Business note |
|----------------|-------------------------|---------|-------|-----------------|---------------------|----------------|------------|----------------|
| `POST /auth/register` | `auth.controller.ts` L48–52 | `AuthService.register` (+ W1 email policy) | `@Public` | `@Throttle` AUTH_REGISTER 5/15m in-memory | IP + emailHash | 5/15m (align) | **Closed** | Keeps retail `emailVerifiedAt` behavior |
| `POST /auth/agent-register` | L55–59 | `AgentRegistrationService.registerPublic` | `@Public` | same | IP + emailHash | 5/15m | **Closed** | Invite mode unchanged |
| `POST /auth/login` | L76–85 | `AuthService.login` | `@Public` | AUTH_LOGIN 5/15m | IP (+ optional idHash) | keep 5/15m via Redis-backed or dual | **Closed** | Credential stuffing |
| `POST /orders` | `order.controller.ts` L75–108 | `OrderService.createOrder` | OptionalJwt + maintenance | **None** on create | IP + userId? | 20/15m **later** | **Open** + metric | **W2: do not modify** |
| `POST /account/support/tickets` | `support-account.controller.ts` L42–44 | `SupportService.createTicket` L22–46 | Jwt + Roles CUSTOMER | None | userId (+ IP) | 3/1h + OPEN≤5 | **Closed** | Triggers `notifyAdminNewTicket` |
| `POST /account/support/tickets/:id/messages` | L47–58 | `addCustomerMessage` L59–84 | same | None | userId | 20/1h | **Closed** | Cannot reply if RESOLVED |
| `POST /account/support/upload` | L61–64 | `SupportUploadService.saveScreenshot` | Jwt + CUSTOMER (class) but **handler ignores user** | None | userId | 10/1h | **Closed** | Public URL returned |
| `POST /agents/kyc` | `agent.controller.ts` L64–66 | `submitKyc` L91–140 | Jwt only; ownership via agent row | None | userId | 3/24h | **Closed** | Conflict if SUBMITTED/APPROVED |
| `POST /agents/me/kyc/documents` | L74–81 | `uploadKycDocument` L183–191 | Jwt; `requireOwnAgent` | None | userId | 20/24h | **Closed** | Blocked while SUBMITTED/APPROVED |
| `POST /payments/webhook/:gateway` | `payment.controller.ts` L76+ | Payment / deposit webhook | `@Public` | Global 100/60s only | **None (exclude)** | — | N/A | SePay/MegaPay/PayPal via gateway param |
| `POST /payments/ipn/esim/sepay` | L66–73 | `EsimSepayPaymentService.handleIpn` | `@Public` | Global 100/60s | **None (exclude)** | — | N/A | eSIM SePay IPN |
| Agent API `*` | `agent-api.controller.ts` | Partner API | API key | `@SkipThrottle` | **None** | — | N/A | Already isolated from Nest throttle |

---

## 5. C — Ticket / KYC deep dive

### Tickets

- Create always inserts `status: OPEN` (`support.repository.ts` L22–30).  
- **No** count of existing OPEN before create → unlimited parallel OPEN tickets.  
- Message path: ownership by `customerId`; RESOLVED → cannot add; OPEN → may flip to PROCESSING.  
- Staff reply separate admin controller (out of customer abuse path).  
- **HTTP rate limit ≠ business validation:** OPEN cap must be DB COUNT (or transactional) in addition to Redis.

### KYC

- Allowed agent statuses: `PENDING_KYC` | `REJECTED` (`agent.service.ts` L93–97).  
- Blocks re-submit when KYC `SUBMITTED` | `APPROVED` (L100–106) — **business rule to keep**.  
- Resubmit after REJECTED allowed.  
- Concurrent double-submit: check-then-upsert race (H4) — W2 should add optimistic condition / unique partial strategy **without** auto-reject admin actions.  
- Email verified before KYC: **not** enforced on submit today (login already gates AGENT without verify). Design `19` recommends assert `emailVerifiedAt` on submit — product-aligned, not global retail verify.  
- **No auto-suspend / auto KYC reject** in W2.

---

## 6. D — Upload security

| Aspect | Support upload | KYC document |
|--------|----------------|--------------|
| Auth | JWT CUSTOMER (class) | JWT + own agent |
| Size | 5MB | 10MB |
| MIME | jpeg/png/webp/**gif** (client-declared) | jpeg/png/webp via `assertAllowedMimeType` |
| Magic bytes | No | No |
| Path | `uploads/support/{ts}-{12hex}.{ext}` | `uploads/kyc/{agentId}/{safeName}` |
| Read path | **Public** static + nginx | Authenticated stream + key prefix check |
| User binding | **None** | Folder per agentId |
| Delete API | None observed | None observed |

**Protect without breaking existing tickets:**  
1. Keep serving existing `/uploads/support/*` URLs (compat).  
2. New uploads: longer random (≥16 bytes), optional `/{userId}/` prefix still publicly reachable unless gated.  
3. Prefer **W2 soft hardening**: rate limit + MIME tighten + attachmentUrl prefix allowlist `/uploads/support/`; optional signed query later (W2+).  
4. Hard auth download for new files = larger FE change — flag for owner decision.

---

## 7. E — Payment / provider isolation

| Flow | Path | Abuse limiter? | Notes |
|------|------|----------------|-------|
| SePay / MegaPay / PayPal webhooks | `POST /payments/webhook/:gateway` | Must **never** enter abuse module | Signature + idempotency in payment layer |
| SePay eSIM IPN | `POST /payments/ipn/esim/sepay` | Never | |
| PayOS | Gateway strategy id exists; same webhook pattern if enabled | Never | |
| Airalo / provider | Workers on `provider_queue` / `esim_queue` | N/A (no HTTP abuse guard) | |
| BullMQ workers | `worker.ts` context | No HTTP Throttler | |
| Agent deposit webhook | Nested in payment webhook handler | Never | |

**Gap:** global Nest throttle still counts webhook requests (H3). Recommended W2 **isolation fix** (does not change payment business logic): `@SkipThrottle()` on webhook + eSIM IPN (and health if needed). Owner should confirm this is in W2 scope.

---

## 8. Redis failure policy (target)

| Surface | Policy | Signal |
|---------|--------|--------|
| register / agent-register / login / ticket / message / upload / KYC | **Fail-closed** → 503 (or 429) | Log + metric `abuse_redis_error` |
| `POST /orders` | **Fail-open** + metric/alert | When/if wired later |
| webhooks / IPN / workers | **Not applicable** | Bypass module |

---

## 9. Regression matrix (audit → W2 tests)

Align with `23` sections C–D; extend:

| Case | Expect |
|------|--------|
| Redis shared counter across 2 fake instances | Single limit |
| Redis timeout on register | Fail-closed |
| 6th OPEN ticket | Blocked (business) |
| attachmentUrl `https://evil` | Rejected after harden |
| KYC non-agent JWT | 403 after Roles (or keep 404 — decide) |
| Unverified agent KYC | 403/400 if gate enabled |
| Webhook + SkipThrottle | Not 429 from Nest throttle under load |
| Payment/ledger/eSIM unit suites | Unchanged |
| W1 example.com register | Still 400 |

---

## 10. Rollback (design-level)

- `ABUSE_RATE_LIMIT_ENABLED=false`  
- Per-feature: `SUPPORT_OPEN_CAP_ENABLED=false`, `KYC_EMAIL_VERIFIED_REQUIRED=false`  
- Revert SkipThrottle only if it caused unexpected issue (unlikely)  
- No schema required for v1 OPEN cap  

---

## 11. Planned files (preview — detail in doc 26)

See `26-w2-implementation-plan.md` § files. Preview: `src/common/abuse-rate-limit/*`, wire auth/support/agent controllers/services; **not** order/payment/fulfillment/esim business modules beyond optional `@SkipThrottle` on webhook routes.

---

## 12. Open decisions for owner

1. Include `@SkipThrottle` on `payments/webhook/*` + `ipn/esim/sepay` in W2? (**Recommended**)  
2. KYC: add `@Roles(AGENT)` → 403, or keep 404 from `requireOwnAgent`?  
3. Support upload: soft harden only (rate+MIME+URL prefix) vs authenticated download for **new** files?  
4. Require `emailVerifiedAt` before KYC submit in W2? (**Recommended**, agent-only)  
5. Composite DB index `(customerId, status)` — defer (no migration) or approve migration?  
6. Confirm **no** wiring of abuse limiter to `POST /orders` in W2.

---

## 13. Stop

Audit complete. Implementation must wait for owner acceptance of this report + approval of `26-w2-implementation-plan.md` scope.
