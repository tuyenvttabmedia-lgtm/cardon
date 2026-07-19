# Phase 3B — Public Agent API Gateway

> Date: 2026-06-19  
> Scope: Public partner API (`src/modules/agent-api/`) — auth, buy card, balance, transaction query  
> Not included: Frontend, Admin UI, reconciliation, invoice

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:agent-api` | **PASS (12/12)** |
| `npm run test:agent` (regression) | **PASS (13/13)** |
| Tasks completed | **10/10** |

---

## Module Structure

```
src/modules/agent-api/
├── controllers/agent-api.controller.ts
├── services/
│   ├── agent-api-auth.service.ts
│   └── agent-api-buy.service.ts
├── repositories/agent-api.repository.ts
├── guards/agent-api-auth.guard.ts      # Auth + per-agent rate limit
├── dto/agent-api.dto.ts
├── entities/
│   ├── agent-api.constants.ts
│   ├── agent-api-signature.ts
│   ├── agent-api.mapper.ts
│   └── agent-api.errors.ts
├── agent-api.module.ts
└── agent-api.service.spec.ts
```

Public prefix: **`/api/partner/v1`** (excluded from global `api/v1` prefix)

---

## Deliverables

### TASK 1: Agent API Module

**DONE** — `AgentApiModule` wired in `AppModule`.

### TASK 2: API Authentication

Headers:

| Header | Purpose |
|--------|---------|
| `X-API-KEY` | Plain API key |
| `X-SIGNATURE` | HMAC-SHA256 of canonical payload |
| `X-REQUEST-ID` | Idempotency key (required on all endpoints) |

Flow:

1. SHA256 lookup → `agents.api_key_lookup`
2. bcrypt verify against `api_key_hash`
3. Decrypt `secret_key_encrypted` → verify signature
4. Require `ACTIVE` + `api_enabled`
5. Reject `SUSPENDED`

Signature payload: `{METHOD}:{path}:{requestId}:{sha256(body)}`

Schema migration: `api_key_lookup` column (`20250619100000_agent_api_key_lookup`)

### TASK 3: Idempotency

- Unique constraint: `(agent_id, agent_request_id)` on `orders`
- Duplicate `request_id` → **HTTP 200** with original result
- No double HOLD / charge

### TASK 4: Buy Card API

`POST /api/partner/v1/cards/buy`

```json
{
  "product_code": "GARENA_100K",
  "quantity": 1,
  "request_id": "req-20240618-001"
}
```

Flow:

```
Validate product (SKU, CARD type, ACTIVE)
→ Agent price (PricingService)
→ DB transaction + row lock
→ FinancialTransaction + Ledger HOLD
→ Create AGENT order (PAID)
→ ProviderService.fulfillOrder (sync)
→ SUCCESS: HOLD → DEBIT
→ FAILURE (final): HOLD → RELEASE
→ UNCERTAIN (TIMEOUT): keep HOLD, status PROCESSING
```

### TASK 5: Balance API

`GET /api/partner/v1/balance`

Returns: `available_balance`, `held_balance`, `currency`

### TASK 6: Transaction Query

`GET /api/partner/v1/transactions/:request_id`

Returns: `status`, `cards` (if SUCCESS), `error` (if FAILED)

### TASK 7: Provider Failure Handling

| Provider case | Agent API behavior |
|---------------|-------------------|
| `OUT_OF_STOCK` | RELEASE hold → `FAILED` |
| `LOW_BALANCE` | RELEASE hold → `FAILED` |
| `TIMEOUT` (uncertain) | Keep HOLD → `PROCESSING` |
| `INVALID_SKU` | RELEASE hold → `FAILED` |

Agent never loses money on uncertain states — HOLD retained until resolved.

### TASK 8: Concurrency Safety

- `SELECT … FOR UPDATE` on agent row (via `LedgerService.holdInTransaction`)
- Balance check inside same transaction as HOLD
- Duplicate `(agent_id, request_id)` caught before second hold
- Only one concurrent request succeeds when balance covers one order

### TASK 9: Security

| Rule | Implementation |
|------|----------------|
| Per-agent rate limit | `AgentApiRateLimitGuard` (`agents.rate_limit`, default 100/min) |
| No raw provider errors | Sanitized `error.code` + generic messages |
| No internal IDs in response | Only `request_id`, product, cards |
| Card PIN scoped | Only decrypt cards for authenticated agent's own order |
| Global throttler skipped | `@SkipThrottle()` on partner controller |

### TASK 10: Tests

File: `src/modules/agent-api/agent-api.service.spec.ts`

| Scenario | Status |
|----------|--------|
| API auth success | PASS |
| Invalid signature | PASS |
| Inactive agent denied | PASS |
| Buy card success | PASS |
| Insufficient balance | PASS |
| Duplicate request | PASS |
| Concurrent requests | PASS |
| Provider fail releases HOLD | PASS |
| Query transaction | PASS |

Script: `npm run test:agent-api`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/partner/v1/cards/buy` | Buy card with balance HOLD flow |
| GET | `/api/partner/v1/balance` | Available + held balance |
| GET | `/api/partner/v1/transactions/:request_id` | Query transaction status |

---

## Related Changes (Phase 3A integration)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | `agents.api_key_lookup` |
| `agent-credential.service.ts` | Generate lookup hash on credential creation |
| `agent.repository.ts` | `findByApiKeyLookup`, `touchLastUsedAt` |
| `ledger.service.ts` | `holdInTransaction`, `debitFromHoldInTransaction`, `releaseInTransaction` |
| `provider.module.ts` | Export `CardEncryptionService` |
| `main.ts` | Exclude partner routes from global prefix |
| `error-codes.constants.ts` | Partner API error codes |

---

## Explicitly Out of Scope

- Frontend / Admin UI
- Reconciliation
- Invoice generation
- Webhook callbacks (future phase)
- Topup via partner API
- Async queue fulfillment (sync inline for 3B)

---

## Verification Commands

```powershell
$node = "C:\Users\MyHome\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
Set-Location C:\Users\MyHome\Projects\cardon
& $node node_modules/prisma/build/index.js generate
& $node node_modules/@nestjs/cli/bin/nest.js build
& $node node_modules/jest/bin/jest.js --testPathPattern=agent-api
```

---

## Result

**Phase 3B Public Agent API Gateway — FULL PASS**

Stopped after Agent API. Admin UI not started.
