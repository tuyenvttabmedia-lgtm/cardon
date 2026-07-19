# Phase 2E — Payment Core Report

> Date: 2026-06-18  
> Scope: Payment abstraction, mock providers, idempotency, webhook foundation  
> Not included: MegaPay/SePay real API, Provider fulfillment, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:payment` | **PASS (11/11)** |
| Architecture | Controller → Service → Repository → Prisma |

---

## Module Structure

```
src/modules/payment/
├── payment.module.ts
├── controllers/
│   └── payment.controller.ts
├── services/
│   ├── payment.service.ts
│   ├── payment-expiration.service.ts
│   └── payment-audit.service.ts
├── repositories/
│   └── payment.repository.ts          (+ WebhookLogRepository)
├── providers/
│   ├── payment-provider.interface.ts
│   ├── payment-provider.registry.ts
│   └── mock-payment.providers.ts      (Mock MegaPay + SePay — NOT real API)
├── dto/
│   └── create-payment.dto.ts
└── entities/
    ├── payment.constants.ts
    ├── payment.mapper.ts
    ├── payment-state.machine.ts
    └── payment-reference.generator.ts
```

---

## PaymentProviderInterface

```typescript
interface PaymentProviderInterface {
  createPayment(params): Promise<ProviderPaymentResult>;
  verifyWebhook(payload, headers): Promise<WebhookVerificationResult>;
  queryTransaction(reference): Promise<ProviderTransactionStatus>;
  refund(reference, amount?): Promise<RefundResult>;  // placeholder
}
```

**Implementations (mock only):**

| Gateway | Class | Real API |
|---------|-------|----------|
| MEGAPAY | `MockMegaPayProvider` | **No** |
| SEPAY | `MockSePayProvider` | **No** |

---

## Payment Creation Flow

```
Order WAITING_PAYMENT
    ↓
Validate + Idempotency-Key lookup
    ↓
Create payments row (PENDING, payment_reference)
    ↓
Link orders.payment_id
    ↓
Provider adapter createPayment() → mock payment URL
    ↓
Return payment info (NOT PAID)
```

**Endpoint:** `POST /api/v1/payments`  
**Header:** `Idempotency-Key` (required)

---

## Idempotency

| Rule | Implementation |
|------|----------------|
| Same `Idempotency-Key` | Return existing payment (no duplicate row) |
| Storage | `payments.idempotency_key` UNIQUE |
| Prevents double payment initiation | **PASS** |

---

## Webhook Foundation

**Endpoint:** `POST /api/v1/payments/webhook/:gateway` (public)

```
Receive webhook
    ↓
Provider.verifyWebhook() — HMAC signature (mock)
    ↓
Save webhook_logs
    ↓
Find payment by payment_reference
    ↓
If already SUCCESS → 200 OK duplicate (no reprocess)
    ↓
Update payment status
    ↓
SUCCESS → OrderService.markPaid()
FAILED  → OrderService.markPaymentFailed()
```

**Mock signature:** `x-webhook-signature` = HMAC-SHA256(payload, `mock-payment-webhook-secret`)

Webhook handler **does not** call provider API.

---

## Payment Status Machine

### Payment record (`payments.status`)

| From | Allowed → |
|------|-----------|
| PENDING | SUCCESS, FAILED, EXPIRED |
| EXPIRED | (terminal) |
| FAILED | (terminal) |
| SUCCESS | (terminal) |

### Order (`orders.payment_status`)

| Blocked | Enforced by |
|---------|-------------|
| EXPIRED → PAID | `assertCanMarkPaid()` + webhook guard |
| FAILED → PAID | `assertPaymentTransition()` |

---

## Order Integration

On webhook **SUCCESS**:

```typescript
OrderService.markPaid(orderId, paymentId)
```

- Validates not expired via `assertCanMarkPaid()`
- Sets `payment_status = PAID`
- Links `orders.payment_id`
- **Does NOT** trigger fulfillment queue

---

## Payment Expiration

`PaymentExpirationService`:

```
payments PENDING + expires_at < now → EXPIRED
orders WAITING_PAYMENT → EXPIRED (if linked)
```

Worker not created — foundation only.

---

## Audit Log

| Action | Trigger |
|--------|---------|
| `PAYMENT_CREATED` | After payment row created |
| `PAYMENT_SUCCESS` | Webhook SUCCESS processed |
| `PAYMENT_FAILED` | Webhook FAILED processed |
| `PAYMENT_DUPLICATE_WEBHOOK` | Duplicate SUCCESS webhook |

Target: `AuditTargetType.ORDER` (orderId)

---

## Schema Change

Migration `20250618140000_payment_idempotency_key`:

```sql
ALTER TABLE payments ADD COLUMN idempotency_key VARCHAR(128);
CREATE UNIQUE INDEX payments_idempotency_key_key ON payments(idempotency_key);
```

---

## Order Module Updates

| Method | Purpose |
|--------|---------|
| `OrderService.markPaid(orderId, paymentId)` | Webhook SUCCESS |
| `OrderService.markPaymentFailed(orderId)` | Webhook FAILED |
| `OrderRepository.findByIdWithPaymentFields()` | Payment validation |
| `OrderRepository.linkActivePayment()` | Set payment_id |

---

## Test Results

**Command:** `npm run test:payment`

| Test | Result |
|------|--------|
| Create payment | **PASS** |
| Duplicate idempotency key | **PASS** |
| Webhook success | **PASS** |
| Duplicate webhook | **PASS** |
| Invalid signature | **PASS** |
| Expired payment cannot success | **PASS** |
| Order marked paid | **PASS** |
| Idempotency-Key required | **PASS** |
| Payment expiration | **PASS** |
| State machine EXPIRED block | **PASS** |
| markPaid rejects EXPIRED | **PASS** |

```
Test Suites: 1 passed
Tests:       11 passed
```

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run test:payment` | **PASS (11/11)** |

---

## Intentionally Not Implemented

- MegaPay real API integration
- SePay real API integration
- Provider eSale / fulfillment queue
- Agent API
- Payment cron worker
- Frontend

---

## Next Phase (Not Started)

**MegaPay / SePay real gateway integration** — replace mock providers with live adapters.

---

**Phase 2E: COMPLETE — FULL PASS**
