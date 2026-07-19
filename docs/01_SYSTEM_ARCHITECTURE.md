# System Architecture

## Layered Architecture

All backend code follows strict layering:

```
Controller
    ↓
Service        ← all business logic here
    ↓
Repository     ← data access only
    ↓
Database
```

**Rules:**

- Controllers handle HTTP, validation, and response mapping only
- Services contain all business logic
- Repositories contain Prisma queries only — no business rules
- Never call database directly from controllers

## Provider Abstraction

```
OrderService
    ↓
ProviderInterface
    ↓
ESaleProvider | IMediaProvider | (future providers)
```

**ProviderInterface methods:**

| Method | Purpose |
|--------|---------|
| `buyCard()` | Purchase game/mobile card |
| `topup()` | Mobile topup |
| `checkTransaction()` | Recover result after timeout |
| `getBalance()` | Query provider account balance |
| `syncProduct()` | Sync product catalog from provider |

Never call eSale or iMedia API directly from OrderService.

Provider attempts: one order has **many** `provider_transactions` (each retry = new row). Do not store `provider_transaction_id` on `orders`.

## Payment Abstraction

```
PaymentService
    ↓
PaymentInterface
    ↓
MegaPayProvider | SePayProvider
```

**PaymentInterface methods:**

| Method | Purpose |
|--------|---------|
| `createPayment()` | Initiate payment request |
| `verifyWebhook()` | Validate and parse webhook payload |
| `queryTransaction()` | Query payment status |
| `reconcile()` | Match payment records with gateway |

Never connect MegaPay or SePay directly inside OrderService.

## Payment vs Fulfillment

Payment and fulfillment are **separate concerns**.

```
Customer pays → payment_status = PAID
Provider fails → fulfillment_status = WAITING_ADMIN_RETRY
```

Example failure scenarios after successful payment:

- Provider out of balance
- Provider out of stock
- Provider timeout

**Do NOT auto-refund** when provider fails. Admin retries manually after fixing provider.

## Async Processing (Queue)

Never call provider API inside payment webhook handler.

```
Payment Webhook
    ↓
Save Transaction (idempotent)
    ↓
Push to Queue (BullMQ)
    ↓
Worker
    ↓
Provider API
```

Stack: Redis + BullMQ. See [17_QUEUE_REGISTRY.md](./17_QUEUE_REGISTRY.md) for all queues.

## Provider Timeout Handling

```
buyCard() / topup()
    ↓
timeout
    ↓
checkTransaction()   ← recover existing result
    ↓
NEVER call buyCard() again
```

## Provider Low Balance Policy

When provider has low balance or is out of stock:

- **Do NOT disable selling**
- Accept customer orders normally
- After payment: set `fulfillment_status = WAITING_ADMIN_RETRY`
- Admin fixes provider issue → manual retry

## Idempotency

Every external transaction requires a unique identifier.

| Field | Constraint | Prevents |
|-------|-----------|----------|
| `payments.payment_reference` | UNIQUE | Duplicate webhook |
| `provider_transactions.request_id` | UNIQUE | Duplicate provider call |
| `(agent_id, agent_request_id)` | UNIQUE per agent | Double charge from agent |

Duplicate agent API requests return **HTTP 200** with the original result.

## Finance Ledger

Never update balance directly:

```typescript
// WRONG
agent.balance += amount;

// CORRECT — agent order flow
createTransaction();
ledgerHold({ reference_type: 'TRANSACTION', reference_id: transaction.id });
createOrder();
// on provider success: ledgerDebitFromHold({ reference_type: 'ORDER', reference_id: order.id });
// on provider fail:    ledgerRelease({ reference_type: 'ORDER', reference_id: order.id });
```

Agent API key: store `api_key_hash` (bcrypt). Show plain key once on generate. Webhook signing uses `secret_key_encrypted`.

Payment reference: lives on `payments` table only. Orders link via `orders.payment_id`.

## Security

| Data | Storage |
|------|---------|
| API keys / secrets | Encrypted in database |
| Card PIN | Encrypted in database |

Never store plain sensitive data.

## Project Structure (Target)

```
cardon/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared types
├── docs/
└── docker/
```
