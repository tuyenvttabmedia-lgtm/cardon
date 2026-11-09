# 17 — Redis rate-limit design

**Depends on:** `15-abuse-findings-evidence.md` (F3, F4, F5, E)  
**Constraint:** Must not destabilize BullMQ payment/fulfillment queues.

---

## Root cause

`ThrottlerModule.forRoot` in `app.module.ts` uses default **in-memory** storage. Limits do not share across API instances; rotating IPs bypass IP-only keys. Abuse endpoints (order create, tickets, KYC) lack dedicated limits.

---

## Proposed solution

### Architecture

```
Request → Nest ThrottlerGuard / AbuseLimiterService
            → Redis INCR + EXPIRE (or SET NX sliding)
            → prefix: cardon:abuse:{endpoint}:{dimension}:{id}
BullMQ  → same Redis server, different key space (bull:*)
```

- Prefer dedicated **logical DB index** or strict prefix `cardon:abuse:`  
- Do **not** use BullMQ queues for rate-limit counters  
- Optional: separate Redis DB number via `REDIS_ABUSE_URL` if ops wants isolation (nice-to-have)

### Multi-key dimensions

| Dimension | Key material | Use |
|-----------|--------------|-----|
| IP | `extractClientIp` (trust CF via nginx real_ip) | Anonymous / register / guest order |
| userId | JWT sub | Ticket, KYC, authenticated order |
| emailHash | SHA-256(normalized email) | Register / agent-register |

Evaluate **all** applicable keys; reject if **any** exceeds limit (fail closed on that endpoint).

### Suggested limits (v1 — tunable via ENV)

| Endpoint | Limit | TTL | Keys |
|----------|-------|-----|------|
| `POST /auth/register` | 5 | 15m | IP + emailHash |
| `POST /auth/agent-register` | 5 | 15m | IP + emailHash |
| `POST /auth/login` | keep existing AUTH_LOGIN | 15m | IP (+ identifier hash optional) |
| `POST /orders` | 20 | 15m | IP + userId (if any) |
| `POST /account/support/tickets` | 3 | 1h | userId (+ IP) |
| Support messages | 20 | 1h | userId |
| Support upload | 10 | 1h | userId |
| `POST /agents/kyc` | 3 | 24h | userId |
| KYC document upload | 20 | 24h | userId |

Global 100/60s may remain as coarse shield.

### Atomicity & TTL

- `INCR` then `EXPIRE` on first hit (or Lua script for atomic TTL set)  
- Return `429` with stable error body (no internal key names)

### Fail-open / fail-closed policy

| Class | Redis down | Rationale |
|-------|------------|-----------|
| Auth register / agent-register / ticket create / KYC | **Fail-closed** (503/429) | Abuse surfaces |
| Login | Fail-closed preferred; short local fallback optional | Credential stuffing |
| `POST /orders` | **Fail-open** with metric alert | Avoid blocking checkout revenue if Redis blip |
| Webhooks / IPN / provider workers | **Never** go through abuse limiter | Payment integrity |
| Health | Skip throttle | Ops |

### Nest integration options

1. `@nestjs/throttler` + Redis storage package, **or**  
2. Thin `AbuseRateLimitGuard` / interceptor wrapping Redis counters for selected routes  

Prefer (2) for multi-key + per-endpoint fail policy without fighting Throttler defaults.

### Isolation from BullMQ

- Prefix + optional DB  
- Connection pool separate from BullMQ worker connections where practical  
- Monitor `cardon:abuse:*` key count; maxmemory-policy must not evict Bull keys preferentially (prefer `volatile-ttl` only if abuse keys always have TTL — they will)

---

## Business impact

- Distributed enforcement across replicas  
- Cuts scripted register/ticket/order floods  

## Performance impact

- 1–3 Redis round-trips per guarded request — typically &lt;2ms local  
- Negligible vs payment/provider latency  

## False-positive risk

- Shared NAT (office/mobile CGNAT): mitigate with higher IP limits + userId/emailHash dimensions  
- Tune after 1 week of metrics  

## Rollback

- ENV `ABUSE_RATE_LIMIT_ENABLED=false` → skip guard  
- Or revert Redis storage → in-memory Throttler only  

## Regression tests

- Unit: counter exceed → 429  
- Unit: Redis error → fail-closed vs fail-open per policy matrix  
- e2e smoke: register 6th time same IP → 429  
- Regression: webhook SePay/MegaPay/eSIM IPN **unthrottled** by abuse module  

## Dependencies

- Redis already required for queues (`queue.module.ts`)  
- Correct client IP behind Cloudflare (`00-cloudflare-real-ip.conf` + Nest trust proxy)  

## Effort

- **M** (1.5–3 days) including tests + ENV docs.
