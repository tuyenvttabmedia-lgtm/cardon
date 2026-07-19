# Agent API Platform

## Overview

The Agent API is CardOn.vn's B2B gateway. Agents purchase digital products using prepaid balance with HOLD-based ledger flow.

```
Agent System
    ↓
Agent API Gateway (NestJS)
    ↓
AgentService
    ↓
TransactionService | LedgerService | OrderService | FulfillmentQueue
```

Agents never call provider APIs directly.

## Authentication

```
Authorization: Bearer {api_key}
```

| Field | Storage | Notes |
|-------|---------|-------|
| API key (plain) | **Never stored** | Shown **once** on generate/regenerate |
| `api_key_hash` | bcrypt hash | Used for comparison only — never encrypt |
| `secret_key_encrypted` | AES-256-GCM | Webhook HMAC signing |
| `last_used_at` | TIMESTAMPTZ | Updated on each authenticated request |

| Rule | Detail |
|------|--------|
| Rotation | Admin regenerates → old key invalid immediately |
| Rate limit | Per-agent via `agents.rate_limit` (default 100 req/min) |

## Idempotency

Every request MUST include `agent_request_id`:

```typescript
{
  "agent_request_id": "req-20240618-001",
  "product_sku": "VNG_100K",
  "quantity": 10
}
```

| Constraint | Scope |
|-----------|-------|
| `UNIQUE(agent_id, agent_request_id)` | Per agent — different agents may reuse same ID string |

**Duplicate behavior:** Return **HTTP 200** with original order response. Do **not** return 409. Do not re-hold or re-charge.

```typescript
const existing = await orderRepo.findByAgentRequestId(agentId, agentRequestId);
if (existing) {
  return mapToAgentResponse(existing);  // 200, idempotent
}
```

## Order Creation Flow

```
Agent POST /orders
    ↓
Validate API key → update last_used_at
    ↓
Check idempotency (agent_id + agent_request_id) → return 200 if exists
    ↓
ProductEngine.resolveProduct(sku)
    ↓
Calculate total (agent_price × quantity)
    ↓
Create transaction (transaction_id generated)
    ↓
LedgerService.hold(agentId, amount, TRANSACTION, transaction.id)
    ↓
Create order + order_item(s)
    ↓
transaction.status = HOLD
    ↓
FulfillmentQueue.add({ orderId })
    ↓
Return HTTP 200 (fulfillment_status: PROCESSING)
```

If hold fails (insufficient available balance) → 400 `INSUFFICIENT_BALANCE`. No transaction completed.

## Provider Success / Failure

See [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md):

- **Success:** HOLD → DEBIT
- **Failure:** HOLD → RELEASE

## API Endpoints

### POST /api/v1/agent/orders

**Card request:**

```json
{
  "agent_request_id": "req-20240618-001",
  "product_sku": "GARENA_100K",
  "quantity": 10
}
```

Creates 1 order_item (quantity=10) → 10 card_records on fulfillment.

**Topup request:**

```json
{
  "agent_request_id": "req-20240618-002",
  "product_sku": "MOBIFONE_TOPUP_50K",
  "quantity": 1,
  "phone": "0901234567"
}
```

Creates topup_transaction on fulfillment.

### GET /api/v1/agent/orders/:order_code

**Completed card order response:**

```json
{
  "order_code": "CO-20240618-ABC123",
  "agent_request_id": "req-20240618-001",
  "payment_status": "PAID",
  "fulfillment_status": "COMPLETED",
  "items": [
    {
      "sku": "GARENA_100K",
      "quantity": 10,
      "cards": [
        { "card_serial": "xxxx", "card_pin": "****" }
      ]
    }
  ]
}
```

Card PIN only when `fulfillment_status = COMPLETED`.

### GET /api/v1/agent/balance

```json
{
  "balance": 15000000,
  "held_balance": 980000,
  "available_balance": 14020000,
  "currency": "VND",
  "updated_at": "2024-06-18T09:00:00Z"
}
```

### GET /api/v1/agent/products

Uses `agent_product_prices` when configured; falls back to default agent pricing.

### GET /api/v1/agent/ledger

Paginated `ledger_entries` for authenticated agent.

## Agent Pricing

```
ProductEngine.getAgentPrice(agentId, productId)
    ↓
agent_product_prices.agent_price  (if exists)
    ↓
else default formula from products.sell_price
```

## Webhook Callback

Config in `agent_webhook_configs`. Sign with HMAC using decrypted `secret_key_encrypted`.

```
POST {callback_url}
{
  "event": "ORDER_COMPLETED",
  "order_code": "CO-20240618-ABC123",
  "agent_request_id": "req-20240618-001",
  "fulfillment_status": "COMPLETED"
}
```

Sent via `notification` queue.

## Error Responses

| HTTP | Code | Meaning |
|------|------|---------|
| 200 | — | Success OR duplicate request (idempotent) |
| 400 | `INVALID_SKU` | Product not found or inactive |
| 400 | `INSUFFICIENT_BALANCE` | Available balance too low |
| 401 | `INVALID_API_KEY` | Auth failed |
| 403 | `AGENT_SUSPENDED` | Agent suspended |
| 429 | `RATE_LIMITED` | Too many requests |
| 503 | `SERVICE_UNAVAILABLE` | Temporary issue |

**No 409 for duplicate requests.** Idempotent APIs always return 200 with original result.

## Agent vs B2C

| Aspect | B2C | Agent |
|--------|-----|-------|
| Payment | MegaPay / SePay | Balance HOLD → DEBIT |
| Idempotency | `payments.payment_reference` | `(agent_id, agent_request_id)` |
| Order link | `orders.payment_id` | `orders.transaction_id` |
| Fulfillment | Same worker | Same worker |

## Related Docs

- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
