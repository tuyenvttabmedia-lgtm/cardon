# Payment Gateway Integration

## Overview

CardOn.vn supports multiple payment gateways via abstraction layer.

```
PaymentService
    ↓
PaymentInterface
    ↓
MegaPayProvider | SePayProvider
```

## Credential Storage (Hybrid)

| Source | Used For |
|--------|----------|
| **ENV variables** | Production secrets (API keys, webhook secrets) — required at deploy |
| **`payment_gateways.config_encrypted`** | Dynamic admin overrides — AES-256-GCM with application key |

Admin can update non-critical gateway config without redeploy. ENV takes precedence for critical secrets in production.

## PaymentInterface

```typescript
interface PaymentInterface {
  createPayment(params: CreatePaymentDto): Promise<PaymentResult>;
  verifyWebhook(payload: unknown, headers: Record<string, string>): Promise<WebhookResult>;
  queryTransaction(reference: string): Promise<TransactionStatus>;
  reconcile(date: Date): Promise<ReconcileReport>;
}
```

## Supported Gateways

| Gateway | Provider Class | Use Case |
|---------|-----------------|----------|
| MegaPay | `MegaPayProvider` | Primary B2C checkout |
| SePay | `SePayProvider` | Bank transfer / QR |

## Payment Expiration

Orders start with `payment_status = WAITING_PAYMENT` (not yet paid at gateway).

```
Order created → payment_status = WAITING_PAYMENT
    ↓
Set payment_expires_at = now + PAYMENT_TIMEOUT_MINUTES (default: 15)
    ↓
Push payment_queue job (delayed)
    ↓
Customer pays before expiry → webhook → PAID
    OR
Timeout reached → PaymentWorker → payment_status = EXPIRED, payments.status = EXPIRED
```

| Status | Meaning |
|--------|---------|
| `WAITING_PAYMENT` | Order created, awaiting gateway payment |
| `PAID` | Webhook confirmed |
| `FAILED` | Gateway rejected |
| `EXPIRED` | Timeout — no payment received |
| `REFUNDED` | Manual admin refund |

Configurable via ENV: `PAYMENT_TIMEOUT_MINUTES` (default: 15).

Customer UI: `WAITING_PAYMENT` → "Complete payment"; `EXPIRED` → "Order expired, please reorder".

## createPayment Flow

```
Customer checkout
    ↓
OrderService.createOrder()
    ↓
order.payment_status = WAITING_PAYMENT
order.payment_expires_at = now + timeout
    ↓
PaymentService.createPayment({ orderId, amount, gateway })
    ↓
Create payments row (payment_reference generated, status: PENDING)
    ↓
Link order: orders.payment_id = payments.id
    ↓
PaymentProvider.createPayment()
    ↓
Return payment URL / QR
```

## Webhook Flow

```
Gateway sends webhook
    ↓
PaymentController.webhook()
    ↓
PaymentService.verifyWebhook()
    ↓
Save webhook_logs (payment_reference, signature_valid, ip_address)
    ↓
Idempotency: payments.payment_reference UNIQUE
    ↓
Update payments.status = SUCCESS
    ↓
Update order.payment_status = PAID
    ↓
Push fulfillment queue
    ↓
Push invoice queue (B2C_RECEIPT)
    ↓
Return 200 OK
```

**Critical:** Webhook handler never calls provider API.

## payment_reference Ownership

`payment_reference` exists **only** on `payments` table.

- Orders reference payment via `orders.payment_id`
- Agent orders have no payment row (`payment_id` is NULL)
- Webhook idempotency keyed on `payments.payment_reference`

```typescript
const existing = await paymentRepo.findByReference(ref);
if (existing?.status === 'SUCCESS') {
  return { ok: true, duplicate: true };
}
```

## queryTransaction

Used for customer polling, reconciliation, admin manual check.

## reconcile

Daily job matches gateway records to `payments` by `payment_reference`.

## Payment vs Fulfillment

| Event | payment_status | fulfillment_status |
|-------|---------------|-------------------|
| Order created | WAITING_PAYMENT | PENDING |
| Payment expired | EXPIRED | PENDING |
| Webhook SUCCESS | PAID | PENDING |
| Worker starts | PAID | PROCESSING |
| Provider delivers | PAID | COMPLETED |
| Provider fails | PAID | WAITING_ADMIN_RETRY |

Never auto-refund on provider failure.

## Security

- ENV secrets for production gateway keys
- Admin config encrypted in `payment_gateways.config_encrypted`
- Verify webhook signature on every request
- Log all webhooks to `webhook_logs`

## Error Handling

| Scenario | Action |
|----------|--------|
| Invalid signature | 401, log IP |
| Unknown payment_reference | 404, log |
| Duplicate webhook | 200, skip |
| Amount mismatch | Flag order, alert admin |
| Payment expired | No webhook expected; order EXPIRED |

## Related Docs

- [17_QUEUE_REGISTRY.md](./17_QUEUE_REGISTRY.md) — `payment_queue`
