# Phase 2F.3 — Provider Persistence Hardening Report

**Status:** FULL PASS  
**Date:** 2026-06-19  
**Scope:** Persist eSale transaction metadata for worker restart recovery

---

## Problem (from 2F.2 Audit)

```
eSale transactionDate in adapter memory
    ↓ worker restart
metadata lost
    ↓
checkTransaction cannot recover → double buyCard risk
```

---

## Solution Summary

Persist non-secret request metadata on `provider_transactions` **before** calling eSale. Recovery reads from DB — adapter no longer relies on in-memory map.

---

## Schema Changes

Migration: `prisma/migrations/20250619040000_provider_transaction_persistence/`

| Field | Column | Purpose |
|-------|--------|---------|
| `requestId` (existing) | `request_id` | eSale `transId` / provider request id |
| `providerTransactionDate` | `provider_transaction_date` | eSale `yyyy-MM-dd HH:mm:ss` |
| `providerMetadata` | `provider_metadata` JSON | `requestTime`, `kind`, `providerCode` |
| `status=PROCESSING` (new enum) | — | Row created before HTTP call |

**Not stored:** SecretKey, private key, signature, PIN plain text.

---

## Flow Changes

### buyCard (ProviderService)

```
1. Claim order → PROCESSING
2. Create provider_transactions (status=PROCESSING, transactionDate, metadata)
3. buyCard(requestId, transactionDate, requestTime)
4. On TIMEOUT/PENDING → checkTransaction with persisted context
5. applyProviderResult → SUCCESS/FAILED/TIMEOUT
```

### Worker restart

```
Order fulfillment_status = PROCESSING
    ↓
findLatestRecoverable (PROCESSING | SUCCESS | TIMEOUT | PENDING)
    ↓
checkTransaction(requestId, { providerTransactionDate, requestTime })
    ↓
Recover cards — no new buyCard
```

### Admin retry

```
findLatestRecoverable
    ↓
If recoverable → checkTransaction only
    ↓
Only create new PROCESSING row + buyCard when recovery fails
```

---

## Code Changes

| File | Change |
|------|--------|
| `prisma/schema.prisma` | `PROCESSING` status, `providerTransactionDate`, `providerMetadata` |
| `entities/provider-transaction.metadata.ts` | Metadata types + parsers |
| `repositories/provider.repository.ts` | `findLatestRecoverable`, create with PROCESSING |
| `services/provider.service.ts` | Persist before buyCard, restart recovery |
| `adapters/esale/esale.provider.ts` | Removed in-memory map; `checkTransaction(context)` |
| `interfaces/provider.interface.ts` | `ProviderCheckContext`, extended `BuyCardParams` |

---

## Tests

New: `src/modules/provider/provider.persistence.spec.ts` (4 tests)

| Scenario | Result |
|----------|--------|
| PROCESSING row + transactionDate before buyCard | **PASS** |
| Worker restart → reload metadata → recover | **PASS** |
| Retry after restart — no double buyCard | **PASS** |
| Timeout recovery uses persisted context | **PASS** |

---

## Test Results

```
npm run build          → PASS
npm run test:provider  → 55 passed (6 suites)
npm run test:payment   → 63 passed (regression OK)
```

---

## Resolved Limitation

Phase 2F.2 **known limitation** (in-memory transactionDate) → **RESOLVED** in 2F.3.

---

## Out of Scope (Confirmed)

- Agent API
- Admin UI / retry HTTP endpoint
- Frontend
- New providers

---

## Related

- [PHASE_2F2_PROVIDER_SAFETY_AUDIT.md](./PHASE_2F2_PROVIDER_SAFETY_AUDIT.md)
- [PHASE_2F1_ESALE_INTEGRATION_REPORT.md](./PHASE_2F1_ESALE_INTEGRATION_REPORT.md)
- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)

**Phase 2F.3 Provider Persistence Hardening: FULL PASS**
