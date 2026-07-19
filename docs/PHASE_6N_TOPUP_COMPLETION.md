# Phase 6N — Topup Fulfillment Completion

**Status:** COMPLETE  
**Date:** 2025-06-21  
**Scope constraint:** No changes to card purchase flow, payment, ledger, agent API, or CMS (except `topup.ready` flag).

---

## Summary

Implemented end-to-end mobile topup fulfillment: payment success → `topup_queue` → eSale `topup()` → `topup_transactions` + `provider_transactions`, with timeout recovery, admin retry, and customer/admin visibility.

---

## TASK 1 — Provider topup worker

| Component | Path |
|-----------|------|
| Queue producer | `src/modules/provider/services/topup-queue.producer.ts` |
| Worker | `src/modules/provider/workers/topup.worker.ts` |
| Fulfillment service | `src/modules/provider/services/topup.service.ts` |
| Dispatch router | `src/modules/provider/services/fulfillment-dispatch.service.ts` |

**Flow:**
```
Payment SUCCESS
  → FulfillmentDispatchService.dispatchOrderFulfillment()
  → topup_queue (TOPUP/DATA items)
  → TopupWorker → TopupService.fulfillOrder()
  → adapter.topup() → COMPLETED / WAITING_ADMIN_RETRY
```

CARD orders still route to `provider_queue` unchanged.

---

## TASK 2 — eSale mobile topup integration

Reuses existing adapter (no payment/ledger changes):

- `ESaleProvider.topup()` → `POST {ESALE_API_URL_TOPUP}topup`
- `checkTransaction()` with `kind: 'TOPUP'` → `checkTopupTransaction`
- Telcos via `providerProductCode` (`viettel:50000`, `mobi:50000`, etc.)
- Inputs: `phoneNumber`, `amount`, `transId` (requestId)

Supported networks: Viettel, Mobifone, Vinaphone, Vietnamobile (via eSale telco codes).

---

## TASK 3 — Topup transaction persistence

| Storage | Usage |
|---------|--------|
| `provider_transactions` | `action: TOPUP`, phone/amount in request payload, full provider response |
| `topup_transactions` | Customer-facing record: phone, telco, amount, status, provider reference |

Worker restart recovery: `findLatestRecoverable(..., TOPUP)` + `checkTransaction` only (no blind retry).

---

## TASK 4 — Topup status query

- Timeout/PENDING → `checkTransaction()` with persisted `providerTransactionDate` + metadata `kind: 'TOPUP'`
- Same CARD safety rules — query only, no duplicate topup calls on recovery

---

## TASK 5 — Customer `/account/topups`

Backend already reads `topup_transactions` via `AccountService.listTopupHistory()`.  
Records are now written on successful fulfillment.

---

## TASK 6 — Admin order detail

- Repository includes `topupTransactions`
- Mapper adds `topupDelivery.items` (phone, network, amount, status, provider ref)
- Admin UI tab **Nạp cước** on order detail (no PIN section)

---

## TASK 7 — Provider failure handling

Same rules as CARD via `resolveFulfillmentStatusForFailure()`:

| Failure | Order status |
|---------|--------------|
| OUT_OF_STOCK | WAITING_ADMIN_RETRY |
| LOW_BALANCE | WAITING_ADMIN_RETRY |
| TIMEOUT (unrecoverable) | WAITING_ADMIN_RETRY |

Admin retry → `FulfillmentDispatchService.retryOrderFulfillment()` → `TopupService.retryFulfillment()`.

---

## TASK 8 — Enable switch

`GET /cms/site-config` → `topup.fulfillmentReady = true`  
When admin enables customer topup + eSale topup URL configured → `topup.ready = true`.

---

## TASK 9 — Tests

New specs:

- `src/modules/provider/topup.service.spec.ts` — success, timeout recovery, LOW_BALANCE, worker restart
- `src/modules/provider/entities/topup-phone.util.spec.ts` — phone parsing
- Updated payment/admin specs for dispatch service

Run locally:

```bash
npm run build
npm run build:web
npm run build:admin
npm test
```

---

## Key files changed

| Area | Files |
|------|-------|
| Core | `topup.service.ts`, `topup.worker.ts`, `topup-queue.producer.ts`, `fulfillment-dispatch.service.ts` |
| Repository | `provider.repository.ts` — `TopupTransactionRepository`, `faceValue` in fulfillment query |
| Payment | `payment.service.ts` — dispatch instead of direct provider queue |
| Admin | `admin-order.service.ts`, order detail mapper/repo/UI |
| CMS | `cms.service.ts` — `fulfillmentReady: true` |
| Mock | `mock-esale.provider.ts` — configurable topup behavior for tests |
| Notification | `notifyTopupDelivery()` in-app for customers |

---

## Out of scope (unchanged)

- Card purchase / `provider_queue` CARD logic
- Payment gateways and webhook handling
- Ledger / finance posting
- Agent API buy flow
- CMS content/pages (only site-config readiness flag)
