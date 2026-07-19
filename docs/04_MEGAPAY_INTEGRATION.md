# MegaPay Integration

> CardOn adapter spec — Phase 2E.2. Aligns with `03_PAYMENT.md`.

## Configuration (ENV)

| Variable | Required | Purpose |
|----------|----------|---------|
| `MEGAPAY_MERCHANT_ID` | Production | Merchant identifier |
| `MEGAPAY_SECRET_KEY` | Production | Request signing (create/query) |
| `MEGAPAY_ENDPOINT` | Production | API base URL (e.g. `https://api.megapay.vn`) |
| `MEGAPAY_RETURN_URL` | Production | Customer redirect after payment |
| `MEGAPAY_WEBHOOK_SECRET` | Production | Webhook HMAC verification |
| `MEGAPAY_CALLBACK_URL` | Optional | Webhook URL sent to MegaPay; defaults to `{APP_PUBLIC_URL}/{API_PREFIX}/payments/webhook/megapay` |
| `APP_PUBLIC_URL` | Optional | Public site URL for default callback |

Never hardcode credentials in code.

## ID Mapping

```
CardOn payments.payment_reference  →  MegaPay order_id
```

## Create Payment

`POST {MEGAPAY_ENDPOINT}/v1/checkout/create`

| Field | Source |
|-------|--------|
| `merchant_id` | ENV |
| `order_id` | `payment_reference` |
| `amount` | Order total (VND, integer) |
| `description` | `CardOn order {payment_reference}` |
| `return_url` | `MEGAPAY_RETURN_URL` |
| `callback_url` | Webhook URL |
| `signature` | HMAC-SHA256 (see below) |

Response: `payment_url`, `request_id`, `order_id`

## Request Signature

1. Collect signed fields (exclude `signature`)
2. Sort keys alphabetically
3. Join as `key1=value1&key2=value2`
4. `HMAC-SHA256(canonical, MEGAPAY_SECRET_KEY)` → lowercase hex

## Webhook

MegaPay POSTs to `callback_url`:

| Field | Notes |
|-------|-------|
| `order_id` | Maps to `payment_reference` |
| `amount` | Must match local payment |
| `status` | `SUCCESS`, `FAILED`, `PENDING`, `UNKNOWN` |
| `signature` | HMAC-SHA256 with `MEGAPAY_WEBHOOK_SECRET` |

| MegaPay status | CardOn action |
|----------------|---------------|
| `SUCCESS` | Mark payment SUCCESS → order PAID |
| `FAILED` | Mark payment FAILED |
| `PENDING`, `UNKNOWN` | No final action (200 OK) |

## Query Transaction

`GET {MEGAPAY_ENDPOINT}/v1/checkout/query?merchant_id&order_id&signature`

Used for manual reconciliation and webhook-missing recovery.

## Security

- Never log `signature`, secrets, or customer PII
- Log: `request_id`, `payment_reference`, `status`
