# eSale Integration V3 — Topup API

> Nguồn: `Integration_V3_Topup.pdf` (eSale / Thanh Sơn)  
> CardOn adapter: `ESaleProvider.topup()` → Mobile Topup REST API

---

## Tổng quan

| Thuộc tính | Giá trị |
|------------|---------|
| Loại | RESTful, `POST`, `Content-Type: application/json` |
| Sandbox base URL | `https://partner3sb-esale.zing.vn/esale/mobiletopup/` |
| Production base URL | eSale cung cấp sau sandbox PASS |

**Endpoints:**

| Path | Mục đích |
|------|----------|
| `/getbalance` | Số dư đại lý |
| `/topup` | Nạp cước điện thoại |
| `/checktransaction` | Tra cứu trạng thái giao dịch |

> Phase 2F CardOn: fulfillment CARD trước; topup qua `topup_queue` ở phase sau.

---

## Xác thực & chữ ký

Giống Buy Card: **SHA256 (checkSum/sig)** + **RSA SHA256withRSA (signature)**.

### Get Balance (Topup API)

```
sig = SHA256(agencyCode + "|" + time + "|" + SecretKey)
```

Khác Buy Card Get Balance — **không** có `transId` trong chuỗi sig.

### Topup

```
checkSum = SHA256(agencyCode + "|" + transId + "|" + phoneNumber + "|" + amount + "|" + transDate + "|" + time + "|" + SecretKey)

rawData = agencyCode + "|" + transId + "|" + phoneNumber + "|" + amount + "|" + transDate + "|" + time + SecretKey
signature = Base64(RSA-SHA256.sign(rawData, clientPrivateKey))
```

### Check Transaction (Topup)

```
sig = SHA256(agencyCode + "|" + transId + "|" + transDate + "|" + time + "|" + SecretKey)
```

---

## Mã lỗi (retCode)

| retCode | Mô tả | CardOn mapping |
|---------|--------|----------------|
| `1` | Successful | SUCCESS |
| `-1` | Fail | FAILED |
| `-1000` ~ `-1005` | Request/auth/signature | Reject |
| `-2000` | transId existed | Duplicate |
| `-2001` | transId not existed | Not found |
| `-3000` | Balance not enough | **LOW_BALANCE** |
| `-3002` | Account invalid | FAILED |
| `-3003` | Phone invalid | FAILED |
| `-3005` | Amount invalid | FAILED |
| `-4000` | Maintenance | UNKNOWN |
| Khác | Processing | **PENDING** → checkTransaction |

### providerCode (topup fail detail)

| providerCode | Ý nghĩa |
|--------------|---------|
| `2` | Thuê bao chưa kích hoạt |
| `3` | Thuê bao không tồn tại |
| `4` | Thuê bao bị khóa |
| `5` | Số trả sau |
| `6` | Giao dịch thất bại |

---

## API: Topup Mobile

`POST /topup`

| Param | Required | Mô tả |
|-------|----------|--------|
| `transId` | Yes | Client transaction id (unique) |
| `agencyCode` | Yes | Mã đại lý |
| `clientCode` | Yes | Mã client |
| `phoneNumber` | Yes | SĐT nạp (vd: `0919234567`) |
| `telco` | No | `mobi`, `vina`, `viettel`, `vietnamobile`, `gmobile` — empty = auto từ prefix |
| `amount` | Yes | Số tiền VND (theo mệnh giá nhà mạng) |
| `transDate` | Yes | `yyyy-MM-dd HH:mm:ss` |
| `time` | Yes | Unix timestamp |
| `checkSum` | Yes | SHA256 |
| `signature` | Yes | RSA |

**Mệnh giá hỗ trợ (tóm tắt):**

| Telco | Amounts (VND) |
|-------|----------------|
| Mobifone | 5k–100k, 120k, 150k, 200k, 300k, 500k, 1000k |
| Vinaphone | 5k, 10k, 20k, 25k, 30k, 50k, 100k, 200k, 300k, 500k |
| Viettel | 5k–50k, 100k, 200k, 300k, 500k, 1000k |
| Vietnamobile | 20k–100k, 120k, 150k, 200k, 300k, 500k, 1000k |
| Gmobile | 10k, 20k, 50k, 100k, 200k, 300k, 500k |

**Response SUCCESS `data`:**

| Field | CardOn mapping |
|-------|----------------|
| `transId` | `request_id` |
| `eSaleTransId` | `provider_transaction_id` |
| `discount` | Chiết khấu % |
| `totalAmount` | Số tiền thực trừ |
| `monthYear` | Tháng/năm giao dịch |
| `topupType` | `TT` (trả trước) / `TS` (trả sau) |

→ Cập nhật `topup_transactions` (phase sau).

---

## API: Check Transaction

`POST /checktransaction`

| Param | Required |
|-------|----------|
| `agencyCode` | Yes |
| `clientCode` | Yes |
| `transId` | Yes |
| `transDate` | Yes — ngày tạo transId gốc |
| `time` | Yes |
| `sig` | Yes |

Timeout recovery: **không gọi lại `/topup`** — chỉ `/checktransaction`.

---

## CardOn mapping (Topup — future)

```
CardOn provider_transactions.request_id              →  transId
CardOn provider_transactions.provider_transaction_id →  eSaleTransId
topup_transactions.phone_number                      →  phoneNumber
topup_transactions.amount                            →  amount
```

---

## Sandbox

| Field | Sandbox |
|-------|---------|
| URL | `https://partner3sb-esale.zing.vn/esale/mobiletopup/` |
| `agencyCode` | `9014780450` |
| `clientCode` / `SecretKey` | eSale cung cấp |

---

## Related

- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- [04_ESALE_BUYCARD_API.md](./04_ESALE_BUYCARD_API.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
