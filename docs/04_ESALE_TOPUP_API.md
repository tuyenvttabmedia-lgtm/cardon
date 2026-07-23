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

Sandbox và production **cùng bảng mã**. Nguồn eSale Integration V3 Topup:

| retCode | Mô tả | Result | CardOn mapping |
|---------|--------|--------|----------------|
| `1` | Successful | Successful | **SUCCESS** |
| `-1` | Fail | Fail | **FAILED** |
| `-1000` | Request is invalid | Fail | Reject / UNKNOWN |
| `-1001` | Client is invalid | Fail | Auth error |
| `-1002` | Request params is invalid | Fail | INVALID params |
| `-1003` | Agency code is invalid | Fail | Auth error |
| `-1004` | Authentication fail | Fail | Auth error |
| `-1005` | Verify signature fail | Fail | Signature reject |
| `-2000` | Transaction id is existed | Fail | Duplicate transId |
| `-2001` | Transaction id is not existed | Fail | Not found (check) |
| `-3000` | Agency's balance is not enough | Fail | **LOW_BALANCE** |
| `-3002` | Account is invalid | Fail | FAILED |
| `-3003` | Phone number is invalid | Fail | FAILED |
| `-3005` | Amount of transaction is invalid | Fail | FAILED |
| `-4000` | Service under maintenance | Fail | MAINTENANCE / UNKNOWN |
| **Other** | Processing (mã không xác định) | **Processing** | **PENDING** → chỉ `checktransaction` |

### Rule đối soát / hoàn tiền (eSale, 2026-07)

| Tình huống | Ví NCC (eSale) | Khách CardOn |
|------------|----------------|--------------|
| `retCode=1` SUCCESS | Đã trừ | Giao hàng / hoàn tất đơn |
| `retCode=-1` (và fail xác định khác) | Đã trừ; eSale **tự hoàn** (một số case hoàn T+1 sau đối soát, chậm nhất ngày làm việc hôm sau) | **Không** auto-refund; admin xử lý theo đối soát |
| **Other / Processing** (mã không xác định) | Có thể đã trừ; giữ **pending** | **Giữ PENDING / PROCESSING**, **không hoàn tiền khách** đến khi eSale chốt Success/Fail |
| Timeout HTTP / chưa rõ | — | Không gọi lại `/topup` — chỉ `checktransaction` |

### `checktransaction` timing (bắt buộc)

Gọi API check trạng thái **ít nhất 5 phút** sau khi gọi `/topup` (tránh check đến trước khi GD topup kịp ghi nhận phía eSale).

CardOn: `TOPUP_CHECK_MIN_DELAY_MS = 5 phút`; vòng check tự động 5m → 10m → 15m → 30m.

### providerCode (topup `data` — khác Buy Card)

| providerCode | Ý nghĩa |
|--------------|---------|
| `0` | Đang xử lý tại nhà mạng |
| `1` | Nạp thành công (`providerMessage` thường `"Nap tien thanh cong"`) |
| `2` | Thuê bao chưa kích hoạt |
| `3` | Thuê bao không tồn tại |
| `4` | Thuê bao bị khóa |
| `5` | Số trả sau |
| `6` | Giao dịch thất bại |

**SUCCESS:** `retCode=1` + `data.providerCode=1` + `eSaleTransId` + `totalAmount`.  
**Processing:** mọi `retCode` không nằm bảng Fail ở trên (thường `2`) + `providerCode=0` → PENDING, không gọi lại `/topup`.

**Response SUCCESS `data` fields (topup):** `transId`, `eSaleTransId`, `discount`, `totalAmount`, `monthYear`, `topupType` (`TT`/`TS`), `provider`, `providerCode`, `providerMessage` — không có `cardsList` như Buy Card.

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

Timeout recovery: **không gọi lại `/topup`** — chỉ `/checktransaction`, và **không sớm hơn 5 phút** sau lần topup.

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
