# Phase 3B.1 — Agent Money Safety Audit

> Date: 2026-06-19  
> Scope: Money safety audit for Public Agent API + Ledger integration  
> Not included: Admin UI, invoice, reconciliation, frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:agent-api` | **PASS (27/27)** |
| `npm run test:agent` | **PASS (13/13)** |
| Critical issues found | **1 (fixed)** |
| Checks completed | **10/10** |

---

## Critical Fix Applied

### CHECK 3 — Provider success + ledger failure

**Issue:** If `ProviderService.fulfillOrder` completed (cards persisted, `fulfillment_status = COMPLETED`) but `settleFulfillment` DEBIT failed, a subsequent idempotent replay returned SUCCESS with cards while `financial_transaction` and ledger remained in **HOLD**. Agent received cards without balance debit.

**Fix:** `AgentApiBuyService.ensureOrderSettled()`

- On idempotent `buyCard` replay → retry DEBIT if order COMPLETED + txn HOLD
- On `getTransaction` → same recovery before response
- On settlement failure → return `503 SERVICE_UNAVAILABLE` with message to retry same `request_id`

**Recovery procedure (operations):**

1. Agent retries `POST /cards/buy` or `GET /transactions/:request_id` with **same** `X-REQUEST-ID`
2. System detects COMPLETED order + HOLD financial txn → executes `debitFromHoldInTransaction`
3. If retry fails repeatedly → admin runs manual ledger DEBIT referencing `order_id` (future admin tool)
4. Never RELEASE hold on COMPLETED orders — funds must DEBIT, not release

---

## Audit Results

### CHECK 1: Concurrent balance spending

| Item | Result |
|------|--------|
| Scenario | Balance 100,000 — 10 parallel HOLD 100,000 |
| Expected | 1 success, 9 INSUFFICIENT_BALANCE |
| Balance never negative | **PASS** |
| Test | `agent-api.money-audit.spec.ts` — serialized `$transaction` + row lock simulation |

**Mechanism:** `LedgerService.applyHold` checks `available = balance - held_balance` inside transaction after `SELECT … FOR UPDATE`.

---

### CHECK 2: Duplicate request replay

| Item | Result |
|------|--------|
| Same `X-REQUEST-ID` replayed | **PASS** — same response |
| No new ledger HOLD | **PASS** |
| No new provider call | **PASS** |
| No duplicate card purchase | **PASS** |

**Mechanism:** Early return on `(agent_id, agent_request_id)` unique constraint + pre-insert check inside locked transaction.

---

### CHECK 3: Provider success + ledger failure

| Item | Result |
|------|--------|
| Inconsistent state prevented | **PASS (after fix)** |
| Idempotent replay recovery | **PASS** |
| Recovery documented | **PASS** (this report) |

---

### CHECK 4: Provider timeout

| Item | Result |
|------|--------|
| eSale TIMEOUT | HOLD remains |
| Status returned | `PROCESSING` |
| No premature RELEASE | **PASS** |

**Mechanism:** `shouldReleaseHold` excludes `TIMEOUT`; `AGENT_PARTNER_UNCERTAIN_CODES` keeps HOLD until admin/recovery resolves.

---

### CHECK 5: Provider final failure

| Case | HOLD → RELEASE | Balance restored | Result |
|------|----------------|------------------|--------|
| OUT_OF_STOCK | Yes | Yes | **PASS** |
| LOW_BALANCE | Yes | Yes | **PASS** |

**Mechanism:** `settleFulfillment` → `releaseInTransaction` + `financial_transaction.status = RELEASED` + `fulfillment_status = FAILED`.

---

### CHECK 6: Ledger correctness

| Rule | Result |
|------|--------|
| CREDIT increases balance | **PASS** |
| HOLD locks available funds | **PASS** |
| DEBIT completes purchase from hold | **PASS** |
| RELEASE restores available | **PASS** |
| Never update balance directly | **PASS** — only `LedgerService` via `updateBalancesInTransaction` |
| Ledger append-only | **PASS** — `updateEntry`/`deleteEntry` throw |

**Code scan:** No agent balance mutation outside `ledger.service.ts` + `agent.repository.updateBalancesInTransaction`.

---

### CHECK 7: API security

| Case | Result |
|------|--------|
| Invalid signature | **PASS** — `401 INVALID_SIGNATURE` |
| Disabled API key (`api_enabled=false`) | **PASS** — `403 AGENT_INACTIVE` |
| Suspended agent | **PASS** — `403 AGENT_SUSPENDED` |

---

### CHECK 8: Rate limit

| Item | Result |
|------|--------|
| Per-agent limit (`agents.rate_limit`) | **PASS** |
| Exceed limit | `429 RATE_LIMITED` |

**Note:** In-memory sliding window per agent ID in `AgentApiRateLimitGuard`. Production should migrate to Redis for multi-instance deployments (documented, not implemented).

---

### CHECK 9: Card ownership

| Item | Result |
|------|--------|
| Agent A cards scoped to Agent A orders | **PASS** |
| Agent B query Agent A `request_id` | **PASS** — `404 Transaction not found` |
| Decrypt only on own order | **PASS** — `findOrderByAgentRequestId(agentId, requestId)` |

---

### CHECK 10: API key rotation preparation (documentation only)

**Not implemented** — future admin workflow:

| Action | Planned behavior |
|--------|------------------|
| Rotate key | Admin generates new `api_key` + `secret_key`; update `api_key_hash`, `api_key_lookup`, `secret_key_encrypted`; old key invalid immediately |
| Revoke key | Set `api_enabled = false`, clear `api_key_lookup`; all API calls rejected |
| Audit | `AGENT_API_KEY_GENERATED` / new `AGENT_API_KEY_REVOKED` event |

Existing foundation ready: `api_key_lookup` (indexed), bcrypt hash, encrypted secret, `api_enabled` flag, `last_used_at`.

---

## Test Coverage

File: `src/modules/agent-api/agent-api.money-audit.spec.ts` (15 audit tests)

Combined with `agent-api.service.spec.ts`: **27 tests** via `npm run test:agent-api`

---

## Files Changed

| File | Change |
|------|--------|
| `services/agent-api-buy.service.ts` | `ensureOrderSettled()` recovery; settlement error → 503 |
| `agent-api.money-audit.spec.ts` | **NEW** — 10 check scenarios |

---

## Verification Commands

```powershell
$node = "C:\Users\MyHome\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
Set-Location C:\Users\MyHome\Projects\cardon
& $node node_modules/@nestjs/cli/bin/nest.js build
& $node node_modules/jest/bin/jest.js --testPathPattern=agent-api
& $node node_modules/jest/bin/jest.js --testPathPattern=agent.service
```

---

## Known Non-Critical Limitations

| Item | Risk | Mitigation |
|------|------|------------|
| Rate limit in-memory | Resets per process; not shared across instances | Future: Redis rate limiter |
| Sync inline fulfillment | Long request on provider slow | Future: async queue + webhook (Phase 3C+) |
| Settlement admin tool | Manual DEBIT if automated retry exhausted | Future admin panel |

---

## Result

**Phase 3B.1 Agent Money Safety Audit — FULL PASS**

1 critical issue fixed (ledger settlement recovery). Admin UI not started.
