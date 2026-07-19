# Order Fulfillment

## Overview

Order fulfillment delivers digital products after payment (B2C) or balance HOLD (Agent). Payment and fulfillment are **decoupled**.

```
payment_status     → customer payment or agent hold
fulfillment_status → product delivery
```

## Fulfillment Architecture

```
Trigger (webhook PAID or agent HOLD complete)
    ↓
FulfillmentQueue.add({ orderId })
    ↓
FulfillmentWorker.process(job)
    ↓
FulfillmentService.fulfill(orderId)
    ↓
ProviderInterface.buyCard() | topup()
    ↓
Update card_records | topup_transactions
    ↓
Update fulfillment_status
    ↓
Agent: HOLD → DEBIT (success) or HOLD → RELEASE (fail)
```

Never call provider API inside webhook handler.

## Order Lifecycle

| Step | payment_status | fulfillment_status | Agent ledger |
|------|---------------|-------------------|--------------|
| B2C order created | WAITING_PAYMENT | PENDING | — |
| B2C webhook SUCCESS | PAID | PENDING | — |
| Agent order created | PAID | PENDING | HOLD |
| Worker starts | PAID | PROCESSING | HOLD |
| Provider success | PAID | COMPLETED | DEBIT |
| Provider fail (retryable) | PAID | WAITING_ADMIN_RETRY | HOLD |
| Provider fail (final) | PAID | FAILED | RELEASE |
| Admin retry success | PAID | COMPLETED | DEBIT |

## Data Model: Cards vs Topup

### Card products (multi-quantity)

```
1 order
  └── 1 order_item (quantity = 10)
        └── 10 card_records (one per card, encrypted serial/PIN)
```

### Topup products

```
1 order
  └── 1 order_item (quantity = 1)
        └── 1 topup_transactions (phone_number, telco, amount, provider_reference, status, result_message)
```

## Provider Transactions (1:N)

```
1 order
  └── provider_transactions (attempt 1) — first try
  └── provider_transactions (attempt 2) — admin retry
```

Each attempt has unique `request_id`. `provider_transaction_id` stored on `provider_transactions` only.

## FulfillmentService

```typescript
class FulfillmentService {
  fulfill(orderId: string): Promise<FulfillmentResult>;
  retry(orderId: string, adminId: string): Promise<FulfillmentResult>;
  recoverFromTimeout(orderId: string): Promise<FulfillmentResult>;
  finalizeAgentLedger(orderId: string, success: boolean): Promise<void>;
}
```

`finalizeAgentLedger`:
- success → `LedgerService.debitFromHold()`
- permanent fail → `LedgerService.release()`

## B2C Flow

```
1. Webhook → payment_status = PAID
2. Queue job
3. Provider call → card_records or topup_transactions
4. COMPLETED or WAITING_ADMIN_RETRY
5. No auto-refund on provider fail
```

## Agent Flow

```
1. transaction + HOLD (before order)
2. Order created, queue job
3. Provider call
4. Success → DEBIT from hold
5. Fail (final) → RELEASE hold
```

See [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md).

## Queue Configuration

See [17_QUEUE_REGISTRY.md](./17_QUEUE_REGISTRY.md).

| Product type | Queue |
|--------------|-------|
| CARD | `provider_queue` |
| TOPUP, DATA | `topup_queue` |
| Notifications | `notification_queue`, `email_queue` |

## Timeout Handling

```
Provider call → TIMEOUT
    ↓
provider_transactions.status = TIMEOUT
    ↓
checkTransaction(request_id)
    ↓
FOUND → apply result
NOT FOUND → WAITING_ADMIN_RETRY (HOLD remains for agent)
```

Never call buyCard/topup again for same attempt.

## Admin Manual Retry

New `request_id`, new `provider_transactions` row, push to `fulfillment-retry` queue.

## Idempotency

| Key | Location |
|-----|----------|
| `payments.payment_reference` | B2C webhooks |
| `(agent_id, agent_request_id)` | Agent API → HTTP 200 on duplicate |
| `provider_transactions.request_id` | Per provider attempt |

## Notification

After COMPLETED → `notification` queue (email, agent webhook via `agent_webhook_configs`).

## Related Docs

- [03_PAYMENT.md](./03_PAYMENT.md)
- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- [07_AGENT_API.md](./07_AGENT_API.md)
- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
