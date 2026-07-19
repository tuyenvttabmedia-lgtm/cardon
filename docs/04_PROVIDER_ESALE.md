# Provider Integration — eSale

> CardOn adapter: `ESaleProvider` implements `ProviderInterface`  
> Tài liệu gốc: `Integration_V3_Buycard.pdf`, `Integration_V3_Topup.pdf`

---

## Overview

eSale là nhà cung cấp chính cho **mua thẻ (Buy Card)** và **nạp cước (Topup)**. Mọi HTTP call tới eSale đi qua adapter — không gọi trực tiếp từ OrderService hay webhook.

```
Order PAID → provider_queue → ProviderWorker
    ↓
ProviderInterface
    ↓
ESaleProvider
    ↓
eSale REST API (2 base URL riêng)
```

| Dịch vụ | Base URL (Sandbox) | Chi tiết |
|---------|-------------------|----------|
| **Buy Card** | `https://partner3sb-esale.zing.vn/esale/cardshop/` | [04_ESALE_BUYCARD_API.md](./04_ESALE_BUYCARD_API.md) |
| **Topup** | `https://partner3sb-esale.zing.vn/esale/mobiletopup/` | [04_ESALE_TOPUP_API.md](./04_ESALE_TOPUP_API.md) |

---

## Provider product code format

Mapping `provider_product_code` trong CardOn:

| Loại | Format | Ví dụ |
|------|--------|-------|
| Buy Card | `{supplierCode}:{cardId}` | `VIETTEL:35` |
| Topup | `{telco}:{amount}` hoặc `{telco}` | `viettel:20000` |

---

```typescript
class ESaleProvider implements ProviderInterface {
  buyCard(params): Promise<ProviderResult>;      // POST /buycard
  topup(params): Promise<ProviderResult>;          // POST /topup
  checkTransaction(requestId): Promise<ProviderResult>;
  getBalance(): Promise<BalanceResult>;            // POST /getbalance
  syncProducts(): Promise<ProductSyncResult>;     // POST /getcardlist
}
```

---

## Configuration (ENV)

Không hardcode credentials. Map từ tài liệu eSale V3:

| ENV (CardOn) | eSale field | Mô tả |
|--------------|-------------|--------|
| `ESALE_API_URL_CARD` | cardshop base | Sandbox: `.../esale/cardshop/` |
| `ESALE_API_URL_TOPUP` | mobiletopup base | Sandbox: `.../esale/mobiletopup/` |
| `ESALE_AGENCY_CODE` | `agencyCode` | Mã đại lý |
| `ESALE_CLIENT_CODE` | `clientCode` | Mã client |
| `ESALE_SECRET_KEY` | `SecretKey` | SHA256 checkSum/sig |
| `ESALE_PRIVATE_KEY` | RSA PKCS8 | Ký request `signature` |
| `ESALE_PUBLIC_KEY` | eSale public key | Verify response `signature` |
| `ESALE_TIMEOUT_MS` | HTTP timeout | Default 30000 |

> Phase 2F.1 có thể alias `ESALE_PARTNER_ID` → `ESALE_AGENCY_CODE`, `ESALE_PARTNER_KEY` → `ESALE_SECRET_KEY` nếu cần tương thích tên cũ.

Production credentials: eSale gửi sau khi sandbox test OK.

---

## Authentication & Signature

### Lớp 1 — SHA256 (checkSum / sig)

Ghép tham số bằng `|`, hash SHA256 hex. Dùng `SecretKey`.

**Không log:** SecretKey, checkSum, sig.

### Lớp 2 — RSA SHA256withRSA (signature)

- Client ký request bằng **private key PKCS8**
- Verify response bằng **public key eSale**
- Decrypt `cardCode` (PIN) bằng **client private key** (eSale encrypt bằng client public key)

**Không log:** private key, signature, PIN plain.

---

## buyCard Flow

```
Create provider_transactions (attempt N, request_id = transId)
    ↓
POST /buycard { transId, cardId, supplierCode, quantity, ... }
    ↓
Verify response signature
    ↓
retCode=1 → RSA decrypt cardCode → AES-256-GCM encrypt → card_records
retCode=-3004 → OUT_OF_STOCK → WAITING_ADMIN_RETRY
retCode=-3000 → LOW_BALANCE → WAITING_ADMIN_RETRY
retCode=processing/timeout → checkTransaction (isGetCard=1)
```

Multi-quantity: `quantity=10` → 10 rows `card_records`.

Chi tiết: [04_ESALE_BUYCARD_API.md](./04_ESALE_BUYCARD_API.md)

---

## topup Flow (phase sau)

```
POST /topup { transId, phoneNumber, amount, telco?, ... }
    ↓
SUCCESS → topup_transactions
FAILED / timeout → checkTransaction
```

Chi tiết: [04_ESALE_TOPUP_API.md](./04_ESALE_TOPUP_API.md)

---

## Transaction ID mapping

| CardOn | eSale |
|--------|-------|
| `provider_transactions.request_id` | `transId` |
| `provider_transactions.provider_transaction_id` | `eSaleTransId` |

Bắt buộc cho: query, retry, reconciliation.

---

## Error → CardOn mapping

| eSale retCode | CardOn failureCode | fulfillment_status |
|---------------|-------------------|-------------------|
| `1` | — | COMPLETED |
| `-3004` | OUT_OF_STOCK | WAITING_ADMIN_RETRY |
| `-3000` | LOW_BALANCE | WAITING_ADMIN_RETRY |
| `-1002` / invalid card | INVALID_PRODUCT | WAITING_ADMIN_RETRY |
| Network timeout | TIMEOUT | checkTransaction → recover or WAIT_ADMIN_RETRY |
| Khác (processing) | PENDING | checkTransaction |
| `-1` / unknown | UNKNOWN | WAITING_ADMIN_RETRY |

**Không refund tự động** khi OUT_OF_STOCK / LOW_BALANCE.

---

## Timeout safety

```
buyCard/topup → timeout
    ↓
KHÔNG gọi lại buyCard/topup
    ↓
checkTransaction(transId, transactionDate gốc)
    ↓
FOUND + cards → recover
NOT FOUND → WAITING_ADMIN_RETRY
```

---

## Card encryption (CardOn storage)

| Layer | Algorithm |
|-------|-----------|
| eSale wire | RSA encrypted `cardCode` |
| CardOn DB | AES-256-GCM `encrypted_pin`, `encrypted_serial` |

Decrypt PIN chỉ khi: customer view card / authorized request.

---

## syncProducts (getcardlist)

`POST /getcardlist` → cập nhật:

- `provider_product_code` (cardId / cardCode)
- `provider_cost` (priceDiscount)
- availability / mapping status

**Không ghi đè:** `sell_price`, agent price.

---

## Provider transactions (1:N)

Mỗi lần gọi eSale = 1 row `provider_transactions`. Admin retry = row mới, `attempt + 1`, `transId` mới.

---

## Credential storage (DB)

```json
// providers.api_credentials (encrypted)
{
  "cardApiUrl": "https://partner3sb-esale.zing.vn/esale/cardshop/",
  "topupApiUrl": "https://partner3sb-esale.zing.vn/esale/mobiletopup/",
  "agencyCode": "...",
  "clientCode": "...",
  "secretKey": "...",
  "privateKeyPem": "...",
  "esalePublicKeyPem": "..."
}
```

ENV takes precedence in production (see `12_SECURITY_DEPLOY.md`).

---

## Balance monitoring

`getBalance()` → cập nhật `providers.balance`, `last_balance_synced_at`.

Low balance → `Notification` ADMIN — **không** disable bán hàng.

---

## Related Docs

- [04_ESALE_BUYCARD_API.md](./04_ESALE_BUYCARD_API.md) — Buy Card API V3
- [04_ESALE_TOPUP_API.md](./04_ESALE_TOPUP_API.md) — Topup API V3
- [05_PROVIDER_IMEDIA.md](./05_PROVIDER_IMEDIA.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [PHASE_2F_PROVIDER_CORE_REPORT.md](./PHASE_2F_PROVIDER_CORE_REPORT.md)
