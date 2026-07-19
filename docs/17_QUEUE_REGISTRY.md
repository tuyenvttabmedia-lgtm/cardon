# Queue Registry

> Central registry for all BullMQ queues. See `01_SYSTEM_ARCHITECTURE.md` for async rules.

**Rule:** Webhook handlers push to queues — never call provider API inline.

---

## Queue Summary

| Queue | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `payment_queue` | CheckoutService, cron | PaymentWorker | Payment expiration, status polling |
| `provider_queue` | Webhook handler, Agent API | ProviderWorker | Card buyCard fulfillment |
| `topup_queue` | Webhook handler, Agent API | TopupWorker | Topup / DATA fulfillment |
| `email_queue` | NotificationService | EmailWorker | Transactional emails |
| `reconciliation_queue` | Cron scheduler | ReconciliationWorker | Daily financial reconcile |
| `notification_queue` | FulfillmentService, Admin | NotificationWorker | In-app alerts, agent webhooks |

---

## payment_queue

| Property | Value |
|----------|-------|
| Trigger | Order created with `payment_status = WAITING_PAYMENT` |
| Job | `{ orderId, paymentId, expiresAt }` |
| Action | Mark `EXPIRED` if unpaid after timeout |
| Concurrency | 10 |
| Retry | 3 attempts |

```
Order created (WAITING_PAYMENT)
    ↓
payment_queue.add({ orderId, delay: PAYMENT_TIMEOUT_MS })
    ↓
PaymentWorker: if still WAITING_PAYMENT → EXPIRED
```

Configurable timeout via `PAYMENT_TIMEOUT_MINUTES` (default: 15).

---

## provider_queue

| Property | Value |
|----------|-------|
| Trigger | `payment_status = PAID` (B2C) or agent HOLD complete |
| Job | `{ orderId, attempt, triggeredBy }` |
| Action | `ProviderInterface.buyCard()` → create `card_records` |
| Concurrency | 5 |
| Retry | Admin retry via separate job with `attempt+1` |

Card products (variant.type = CARD) route here.

Legacy alias in older docs: `fulfillment` → **`provider_queue`**.

---

## topup_queue

| Property | Value |
|----------|-------|
| Trigger | Same as provider_queue |
| Job | `{ orderId, orderItemId, attempt }` |
| Action | `ProviderInterface.topup()` → update `topup_transactions` |
| Concurrency | 5 |

Topup and DATA variants route here.

Legacy alias: topup fulfillment split from provider_queue for clarity.

---

## email_queue

| Property | Value |
|----------|-------|
| Trigger | Order COMPLETED, payment confirmation, auth emails |
| Job | `{ type, recipient, template, data }` |
| Action | Send email (no PIN in body) |
| Concurrency | 10 |

| Email Type | Trigger |
|------------|---------|
| `ORDER_COMPLETED` | fulfillment COMPLETED |
| `PAYMENT_SUCCESS` | webhook PAID |
| `EMAIL_VERIFICATION` | register |
| `PASSWORD_RESET` | forgot password |
| `INVOICE_READY` | invoice PDF generated |

---

## reconciliation_queue

| Property | Value |
|----------|-------|
| Trigger | Cron daily 02:00–04:30 |
| Job | `{ domain, date }` |
| Action | Run ReconciliationService |
| Concurrency | 1 per domain |

| Job Name | Schedule |
|----------|----------|
| `reconcile-payment-megapay` | 02:00 |
| `reconcile-payment-sepay` | 02:15 |
| `reconcile-provider-esale` | 03:00 |
| `reconcile-provider-imedia` | 03:15 |
| `reconcile-agent-ledger` | 04:00 |
| `reconcile-order-revenue` | 04:30 |

---

## notification_queue

| Property | Value |
|----------|-------|
| Trigger | Admin alerts, agent webhook callbacks |
| Job | `{ type, recipient, payload }` |
| Action | In-app notification + agent HMAC webhook |
| Concurrency | 10 |

| Event | Recipient |
|-------|-----------|
| `WAITING_ADMIN_RETRY` | SUPPORT, ADMIN |
| `RECONCILE_MISMATCH` | ACCOUNTANT |
| `ORDER_COMPLETED` | Agent webhook (if configured) |

Legacy alias: `notification` → **`notification_queue`**.

---

## Worker Deployment

```
Docker service: worker
    ↓
Processes all queues from single worker process
    OR
Separate worker containers per queue group (production)
```

Health check: Redis queue depth + worker heartbeat key TTL.

---

## Related Docs

- [01_SYSTEM_ARCHITECTURE.md](./01_SYSTEM_ARCHITECTURE.md)
- [03_PAYMENT.md](./03_PAYMENT.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [09_RECONCILIATION.md](./09_RECONCILIATION.md)
