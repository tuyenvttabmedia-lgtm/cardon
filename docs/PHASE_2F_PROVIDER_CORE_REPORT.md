# Phase 2F — Provider Core

> Date: 2026-06-19  
> Scope: Provider abstraction + CARD fulfillment core (`src/modules/provider/`)  
> Not included: Real eSale API, iMedia, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:provider` | **PASS (28/28)** |
| Tasks completed | **12/12** |

---

## Module Structure

```
src/modules/provider/
├── controllers/provider.controller.ts
├── services/
│   ├── provider.service.ts
│   ├── provider-registry.service.ts
│   ├── provider-audit.service.ts
│   ├── provider-health.service.ts
│   ├── provider-queue.producer.ts
│   └── card-encryption.service.ts
├── repositories/provider.repository.ts
├── interfaces/provider.interface.ts
├── adapters/
│   ├── mock-esale.provider.ts      (NOT real eSale API)
│   └── mock-imedia.provider.ts       (future placeholder)
├── workers/provider.worker.ts
├── dto/provider-queue-job.dto.ts
├── entities/
│   ├── provider.constants.ts
│   ├── provider-failure.rules.ts
│   └── provider-request-id.generator.ts
└── provider.module.ts
```

Architecture: **Controller → Service → Repository → Prisma**

---

## Deliverables

### TASK 1: Provider Module

**DONE** — Full module wired in `AppModule`, exports `ProviderService`, `ProviderQueueProducer`.

### TASK 2: ProviderInterface

| Method | Status |
|--------|--------|
| `buyCard()` | **DONE** |
| `topup()` | **DONE** (stub in mock) |
| `checkTransaction()` | **DONE** |
| `getBalance()` | **DONE** |
| `syncProducts()` | **DONE** (stub) |

### TASK 3: Provider Registry

Selection order:
1. Active `provider_product_mappings`
2. Provider `status = ACTIVE`
3. `priority ASC`
4. `providerCost ASC` (lowest cost — via repository sort)

Adapters: **ESALE** (mock), **IMEDIA** (placeholder).

### TASK 4: Fulfillment Flow

```
Order PAID
    ↓
PaymentService → provider_queue.enqueueFulfillment()
    ↓
ProviderWorker
    ↓
ProviderService.fulfillOrder()
```

CARD products only in Phase 2F.

### TASK 5: Card Fulfillment

```
quantity=10 → buyCard(10) → 10 card_records
```

| Field | Storage |
|-------|---------|
| `encrypted_pin` | AES-256-GCM via `CardEncryptionService` |
| `encrypted_serial` | AES-256-GCM |
| `expired_at` | `providerResponse.expiredAt` JSON |

Never stores plain PIN/serial.

### TASK 6: Provider Transactions

Every attempt → `provider_transactions` row with incrementing `attempt`.

Admin retry → **new row**, new `request_id` — history preserved.

### TASK 7: Provider Failure Handling

| Code | fulfillment_status | Refund |
|------|-------------------|--------|
| OUT_OF_STOCK | WAITING_ADMIN_RETRY | **No** |
| LOW_BALANCE | WAITING_ADMIN_RETRY | **No** |
| TIMEOUT | WAITING_ADMIN_RETRY | **No** |
| UNKNOWN | WAITING_ADMIN_RETRY | **No** |

### TASK 8: Timeout Handling

```
buyCard → TIMEOUT
    ↓
checkTransaction(requestId)   ← never blind retry buyCard
    ↓
FOUND → apply cards / SUCCESS
NOT FOUND → WAITING_ADMIN_RETRY
```

### TASK 9: Manual Retry Foundation

`ProviderService.retryFulfillment(orderId)` — **no admin HTTP endpoint yet**.

Creates new `provider_transaction` with `attempt + 1`.

### TASK 10: Provider Health

`ProviderHealthService.syncProviderBalance()`:
- Calls `getBalance()`
- Updates `providers.balance`, `last_balance_synced_at`
- Low balance → `Notification` only — **does NOT disable selling**

### TASK 11: Audit Logs

| Action | Channel |
|--------|---------|
| PROVIDER_ATTEMPT | `audit_logs` via `ProviderAuditService` |
| PROVIDER_SUCCESS | same |
| PROVIDER_FAILED | same |
| PROVIDER_RETRY | same |

Also `provider_logs` table per API call.

### TASK 12: Tests

| Scenario | Result |
|----------|--------|
| Successful card delivery | **PASS** |
| quantity=10 → 10 records | **PASS** |
| OUT_OF_STOCK | **PASS** |
| LOW_BALANCE | **PASS** |
| Timeout recovery | **PASS** |
| Timeout → WAITING_ADMIN_RETRY | **PASS** |
| Manual retry (attempt 2) | **PASS** |
| Multiple attempts history | **PASS** |
| Registry priority selection | **PASS** |

---

## Payment Integration

After webhook SUCCESS + atomic PAID:

```typescript
await this.providerQueueProducer.enqueueFulfillment(payment.orderId, 'webhook');
```

Documented in Phase 2E.4 `payment-success-queue.rules.ts` — now **wired**.

---

## Test Results

```
Test Suites: 3 passed (provider pattern includes payment provider specs)
Tests:       28 passed
```

Payment regression: **63/63 PASS**

---

## Out of Scope (Confirmed)

- Real eSale HTTP API
- iMedia real integration
- Agent API / ledger finalize
- Frontend
- Admin retry HTTP endpoint
- topup_queue worker

---

## Next Phase Suggestion

**Phase 2F.1 — eSale Real API Adapter** (when owner requests)

---

## Sign-off

| Item | Status |
|------|--------|
| ProviderInterface + Registry | **PASS** |
| CARD fulfillment + encryption | **PASS** |
| provider_transactions history | **PASS** |
| Failure / timeout rules | **PASS** |
| provider_queue worker | **PASS** |
| Audit logs | **PASS** |
| Tests | **PASS (28/28)** |
| Build | **PASS** |

**Phase 2F Provider Core: FULL PASS**
