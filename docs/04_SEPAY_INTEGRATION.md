# SePay Integration

> CardOn adapter spec — Phase 2E.3. Aligns with `03_PAYMENT.md` and [SePay Webhooks](https://developer.sepay.vn/vi/sepay-webhooks/bat-dau-nhanh).

## Configuration (ENV)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SEPAY_API_KEY` | Production | Webhook auth: `Authorization: Apikey {key}` |
| `SEPAY_WEBHOOK_SECRET` | Optional | HMAC-SHA256 webhook verification |
| `SEPAY_BANK_ACCOUNT` | Production | Bank account number for QR |
| `SEPAY_BANK_CODE` | Production | Bank code/name (e.g. `Vietcombank`) |
| `SEPAY_ACCOUNT_NAME` | Production | Account holder name shown to customer |
| `SEPAY_QR_TEMPLATE` | Optional | QR layout: `compact`, `qronly`, `standee` (default: `compact`) |

Never hardcode credentials in code.

## ID Mapping

```
CardOn payments.payment_reference  →  Transfer content: CARDON {payment_reference}
```

## Create Payment (Bank QR)

```
https://qr.sepay.vn/img?acc={SEPAY_BANK_ACCOUNT}&bank={SEPAY_BANK_CODE}&amount={AMOUNT}&des=CARDON%20{payment_reference}&template={SEPAY_QR_TEMPLATE}
```

Returns: `qr_url`, `bank_info`, `amount`, `expired_at`, `transferContent`.

## Webhook

See [SePay payload docs](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook).

| SePay field | CardOn usage |
|-------------|--------------|
| `id` | Bank transaction id — duplicate detection |
| `transferAmount` | Exact amount validation |
| `content` | Extract `payment_reference` |
| `transferType` | `in` → SUCCESS |

## Authentication

| Method | Header |
|--------|--------|
| API Key | `Authorization: Apikey {SEPAY_API_KEY}` |
| HMAC-SHA256 | `X-SePay-Signature` + `X-SePay-Timestamp` |

## Related

- [03_PAYMENT.md](./03_PAYMENT.md)
- [04_MEGAPAY_INTEGRATION.md](./04_MEGAPAY_INTEGRATION.md)
