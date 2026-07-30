# Partner Agent API (v1)

CardOn B2B gateway. Agents buy digital cards with prepaid balance (HOLD → DEBIT / RELEASE).

**Public prefix:** `/api/partner/v1`  
Agents never call provider APIs directly.

## Authentication

Every request requires three headers:

| Header | Purpose |
|--------|---------|
| `X-API-KEY` | API key (`ak_test_…` sandbox / `ak_live_…` or legacy `ak_…` production) |
| `X-REQUEST-ID` | Unique request id (idempotency for buy) |
| `X-SIGNATURE` | HMAC-SHA256 of signature payload |

**Not used:** `Authorization: Bearer`.

### Signature

```
payload = METHOD:path:requestId:sha256(rawBody)
signature = HMAC-SHA256(secretKey, payload)  // hex
```

- `METHOD` — uppercase (`GET`, `POST`)
- `path` — **no leading slash**, e.g. `api/partner/v1/cards/buy`
- `rawBody` — exact JSON body string for POST; empty string for GET
- Secret — decrypted agent secret (`sk_…`), shown **once** on generate/rotate

### Credential storage

| Field | Storage |
|-------|---------|
| API key (plain) | Never stored — shown once |
| `api_key_hash` / `sandbox_api_key_hash` | bcrypt |
| `api_key_lookup` / `sandbox_api_key_lookup` | SHA-256 of plain key (lookup only) |
| Secret | AES-256-GCM encrypted |

### Environments

| Key prefix | Environment | Balance | Fulfillment |
|------------|-------------|---------|-------------|
| `ak_test_` | SANDBOX | `sandbox_balance` | Mock cards — no provider call |
| `ak_live_` / legacy `ak_` | PRODUCTION | live `balance` | Real provider |

- Sandbox credentials are issued **after KYC APPROVED**.
- Live API (`live_api_enabled`) is enabled separately (invite / admin) after sandbox UAT.
- Sandbox and live keys never share ledger balances.

## Idempotency

Buy body field: `request_id` (must equal `X-REQUEST-ID`).

| Constraint | Scope |
|------------|-------|
| `UNIQUE(agent_id, agent_request_id)` | Per agent |

Duplicate → **HTTP 200** with original result (not 409). No second HOLD.

## Endpoints

### `POST /api/partner/v1/cards/buy`

```json
{
  "product_code": "GARENA_100K",
  "quantity": 1,
  "request_id": "req-20250618-001"
}
```

**SUCCESS response:**

```json
{
  "request_id": "req-20250618-001",
  "status": "SUCCESS",
  "product_code": "GARENA_100K",
  "quantity": 1,
  "amount": "95000.00",
  "cards": [
    { "card_serial": "1234567890", "card_pin": "ABCD1234" }
  ]
}
```

`status`: `SUCCESS` | `PROCESSING` | `FAILED`  
On `FAILED`, body may include `error: { code, message }` (still HTTP 200 for business failures after accept).

### `GET /api/partner/v1/balance`

```json
{
  "available_balance": "1500000.00",
  "held_balance": "50000.00",
  "currency": "VND"
}
```

Returns sandbox or live balances depending on which API key authenticated the request.

### `GET /api/partner/v1/transactions/:request_id`

Same shape as buy response. Cards only when `status = SUCCESS`.

### `GET /api/partner/v1/products`

Returns **all ACTIVE SKUs** with resolved `agent_price` (manual override → margin config by product group → sell price fallback).

Pricing: `CK_ĐL = CK_NCC − biên_LN CardOn` (% of face from admin margin config); `agent_price = face × (1 − CK_ĐL)`.

```json
{
  "items": [
    {
      "product_code": "VIETTEL_10K",
      "name": "Viettel 10K",
      "category": "Thẻ điện thoại Viettel",
      "face_value": "10000.00",
      "agent_price": "9800.00",
      "status": "ACTIVE"
    }
  ]
}
```

### `GET /api/partner/v1/providers`

Routing capability probe (does **not** expose upstream supplier identity):

```json
{
  "items": [{ "code": "cardon", "name": "CardOn", "status": "ACTIVE" }]
}
```

No partner topup API in v1.

## Money flow

```
Auth → idempotency check
  → resolve product + agent price
  → create financial_transaction + HOLD (sandbox or live balance)
  → create order (PAID / PENDING fulfill)
  → fulfill (mock sandbox | provider live)
  → COMPLETED: HOLD → DEBIT | FAILED: HOLD → RELEASE
  → schedule outbound webhook
```

## Outbound webhook

Configured in Partner → Webhook (`agent_webhook_configs`).  
Signed with **webhook secret** (separate from API request secret).

| Header | Value |
|--------|-------|
| `X-CardOn-Signature` | HMAC-SHA256(`timestamp.rawBody`, webhook secret) |
| `X-CardOn-Timestamp` | Unix seconds |
| `X-CardOn-Event` | `order.completed` \| `order.failed` |
| `X-CardOn-Version` | `v1` |

**Payload (v1):**

```json
{
  "version": "v1",
  "event": "order.completed",
  "request_id": "req-20250618-001",
  "order_id": "uuid",
  "partner_order_id": "req-20250618-001",
  "status": "SUCCESS",
  "product": "GARENA_100K",
  "amount": "95000.00",
  "created_at": "2026-07-28T10:00:00.000Z",
  "completed_at": "2026-07-28T10:00:01.000Z",
  "gateway": "wallet",
  "serial": "…",
  "pin": "…",
  "environment": "SANDBOX"
}
```

Delivery: BullMQ `webhook_delivery_queue`, retry 5× (0 / 1m / 5m / 15m / 30m).  
Events only for terminal fulfillment (`COMPLETED` / `FAILED`).

## HTTP errors

Envelope: `{ "success": false, "error": { "code", "message" } }`

| HTTP | Code |
|------|------|
| 400 | `MISSING_REQUEST_ID`, `INVALID_SKU`, `INSUFFICIENT_BALANCE` |
| 401 | `INVALID_API_KEY`, `INVALID_SIGNATURE` |
| 403 | `FORBIDDEN` (IP), `AGENT_SUSPENDED`, `AGENT_INACTIVE` |
| 429 | `RATE_LIMITED` |
| 503 | `SERVICE_UNAVAILABLE` (settlement pending — retry same `request_id`) |

**No 409** for duplicate buy — return 200 + original body.

## Related

- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
- [GATE1_PARTNER_UAT_CHECKLIST.md](./GATE1_PARTNER_UAT_CHECKLIST.md)
- [GATE1_PARTNER_MVP_FREEZE.md](./GATE1_PARTNER_MVP_FREEZE.md)
