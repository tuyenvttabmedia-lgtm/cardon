# eSale Integration V3 — Buy Card API

> Nguồn: `Integration_V3_Buycard.pdf` (eSale / Thanh Sơn)  
> CardOn adapter: `ESaleProvider` → Card Shop REST API

---

## Tổng quan

| Thuộc tính | Giá trị |
|------------|---------|
| Loại | RESTful, `POST`, `Content-Type: application/json` |
| Sandbox base URL | `https://partner3sb-esale.zing.vn/esale/cardshop/` |
| Production base URL | eSale cung cấp sau khi sandbox PASS |

**Endpoints:**

| Path | Mục đích |
|------|----------|
| `/getcardlist` | Danh sách thẻ + giá đại lý |
| `/buycard` | Mua thẻ |
| `/checktransaction` | Tra cứu / recovery giao dịch |
| `/getbalance` | Số dư tài khoản đại lý |

---

## Xác thực & chữ ký

eSale dùng **hai lớp**:

### 1. checkSum / sig — SHA256 + SecretKey

Ghép chuỗi bằng `|`, hash SHA256 hex (lowercase).

**Ví dụ Buy Card:**

```
checkSum = SHA256(agencyCode + "|" + transId + "|" + supplierCode + "|" + cardId + "|" + quantity + "|" + time + "|" + SecretKey)
```

**Ví dụ Get Card List:**

```
sig = SHA256(agencyCode + "|" + time + "|" + SecretKey)
```

**Ví dụ Check Transaction:**

```
checkSum = SHA256(agencyCode + "|" + transId + "|" + isGetCard + "|" + time + "|" + SecretKey)
```

**Ví dụ Get Balance (Buy Card API):**

```
sig = SHA256(transId + "|" + agencyCode + "|" + time + "|" + SecretKey)
```

### 2. signature — RSA SHA256withRSA

**Request signing (Client → eSale):**

```
rawData = agencyCode + "|" + transId + "|" + supplierCode + "|" + cardId + "|" + quantity + "|" + time + SecretKey
signature = Base64(RSA-SHA256.sign(UTF-8 bytes of rawData, clientPrivateKey_PKCS8))
```

**Response verification (eSale → Client):**

Dùng **public key eSale cung cấp** để verify `data.signature`.

- Nếu `retCode == 1` (SUCCESS):
  ```
  cardString = serial1 + cardCode1 + expiredDate1 + ... + serialN + cardCodeN + expiredDateN
  rawData = retCode + "|" + transId + "|" + time + "|" + cardString
  ```
- Nếu `retCode != 1`:
  ```
  rawData = retCode + "|" + transId + "|" + time
  ```

---

## Mã lỗi (retCode)

| retCode | Mô tả | CardOn mapping |
|---------|--------|----------------|
| `1` | Successful | SUCCESS |
| `-1` | Fail | FAILED / UNKNOWN |
| `-1000` | Request invalid | INVALID params |
| `-1001` | Client invalid | Auth error |
| `-1002` | Request params invalid | INVALID params |
| `-1003` | Agency code invalid | Auth error |
| `-1004` | Authentication fail | Auth error |
| `-1005` | Verify signature fail | Signature reject |
| `-2000` | Transaction id existed | Duplicate transId |
| `-2001` | Transaction id not existed | Not found (checkTransaction) |
| `-3000` | Balance not enough | **LOW_BALANCE** |
| `-3001` | Amount over quota | FAILED |
| `-3002` | Account invalid | FAILED |
| `-3004` | Out of stock | **OUT_OF_STOCK** |
| `-4000` | Service maintenance | UNKNOWN |
| Khác | Processing | **PENDING** → gọi `/checktransaction` |

> Lỗi mạng / timeout / mã không trong danh sách success/fail → **không retry buyCard** — gọi `checkTransaction`.

---

## API: Get Card List

`POST /getcardlist`

| Param | Required | Mô tả |
|-------|----------|--------|
| `agencyCode` | Yes | Mã đại lý |
| `clientCode` | Yes | Mã client |
| `cardType` | Yes | `Game`, `Card`, hoặc `Card3G` |
| `time` | Yes | Unix timestamp |
| `sig` | Yes | SHA256 signature |

**Response `data.info[]`:**

| Field | Mô tả |
|-------|--------|
| `cardId` | ID thẻ trên eSale |
| `cardCode` | Mã sản phẩm |
| `cardName` | Tên hiển thị |
| `supplierCode` | Mã telco/nhà phát hành |
| `unitPrice` | Giá gốc |
| `discount` | % chiết khấu |
| `priceDiscount` | Giá sau chiết khấu |

→ Dùng cho **`syncProducts()`** — cập nhật `provider_cost`, `provider_product_code`, availability. **Không** ghi đè `sell_price`.

---

## API: Buy Card

`POST /buycard`

| Param | Required | CardOn source |
|-------|----------|---------------|
| `transId` | Yes | `provider_transactions.request_id` |
| `agencyCode` | Yes | ENV `ESALE_AGENCY_CODE` |
| `clientCode` | Yes | ENV `ESALE_CLIENT_CODE` |
| `supplierCode` | Yes | Từ mapping / product config |
| `cardId` | Yes | `provider_product_mappings.provider_product_code` (numeric) |
| `quantity` | Yes | `order_items.quantity` |
| `transactionDate` | Yes | `yyyy-MM-dd HH:mm:ss` |
| `time` | Yes | Unix timestamp |
| `checkSum` | Yes | SHA256 |
| `signature` | Yes | RSA |

**Response `data` (SUCCESS):**

| Field | CardOn mapping |
|-------|----------------|
| `transId` | `request_id` |
| `eSaleTransId` | `provider_transactions.provider_transaction_id` |
| `cardsList[]` | → `card_records` |
| `totalAmount` | Audit / reconcile |
| `signature` | Verify trước khi lưu thẻ |

**Mỗi card trong `cardsList`:**

| Field | Xử lý CardOn |
|-------|--------------|
| `serial` | Plain → AES-256-GCM → `encrypted_serial` |
| `cardCode` | RSA decrypt bằng **client private key** → PIN plain → AES-256-GCM → `encrypted_pin` |
| `expiredDate` | `dd/MM/yyyy HH:mm:ss` → lưu trong `provider_response.expiredAt` |

**Giải mã cardCode (eSale encrypt bằng client public key):**

```
plainPin = RSA.decrypt(Base64Decode(cardCode), clientPrivateKey_PKCS8)
```

---

## API: Check Transaction

`POST /checktransaction`

| Param | Required | Mô tả |
|-------|----------|--------|
| `transId` | Yes | Client transaction id |
| `agencyCode` | Yes | Mã đại lý |
| `clientCode` | Yes | Mã client |
| `transactionDate` | Yes | Ngày tạo **transId gốc** (không phải now) |
| `isGetCard` | Yes | `1` = lấy thông tin thẻ, `0` = chỉ status |
| `time` | Yes | Unix timestamp |
| `checkSum` | Yes | SHA256 |
| `signature` | Yes | RSA |

Dùng cho **timeout recovery** và **manual reconciliation**.

---

## API: Get Balance

`POST /getbalance`

| Param | Required |
|-------|----------|
| `transId` | Yes (client-generated) |
| `agencyCode` | Yes |
| `clientCode` | Yes |
| `time` | Yes |
| `sig` | Yes |

→ `ProviderHealthService`, low balance notification.

---

## CardOn ID mapping

```
CardOn provider_transactions.request_id     →  eSale transId
CardOn provider_transactions.provider_transaction_id  →  eSale eSaleTransId
CardOn provider_product_mappings (cardId)   →  eSale cardId
CardOn provider_product_mappings (supplier) →  eSale supplierCode
```

---

## Reference: supplierCode & cardId

`supplierCode` + `cardId` (Production) dùng trong `/buycard`. Sandbox có thể khác cardId — lấy từ `/getcardlist` hoặc bảng dưới.

| Supplier | supplierCode | CardType | Ví dụ cardId (Prod) |
|----------|--------------|----------|---------------------|
| VNG Zing | `ZING` | Game | 49 (10K), 1 (20K), 50 (50K) |
| FPT Gate | `GATE` | Game | 5 (20K), 6 (50K) |
| VTC | `VTC` | Game | 70 (10K), 14 (20K) |
| Garena | `GARENA` | Game | 44 (20K), 45 (50K) |
| SohaGame | `SOHACOIN` | Game | 203 (20K) |
| Funcard | `FUNCARD` | Game | 486 (10K), 220 (20K) |
| Appota | `APPOTA` | Game | 209 (50K) |
| SCoin | `SCOIN` | Game | 261 (20K) |
| KulGame | `KUL` | Game | 536 (10K) |
| Gosu | `GOSU` | Game | 529 (10K) |
| Mobifone | `MOBIFONE` | Card | 42 (10K), 19 (20K) |
| Vinaphone | `VINAPHONE` | Card | 25 (10K), 26 (20K) |
| Vietnamobile | `VIETNAMOBILE` | Card | 43 (10K), 32 (20K) |
| Viettel | `VIETTEL` | Card | 35 (10K), 36 (20K) |
| Mobifone 3G | `MOBIFONE3G` | Card3G | 559 (DDH2 2GB) |
| Vinaphone 3G | `VINAPHONE3G` | Card3G | 496 (VNP500MB) |

Bảng đầy đủ mệnh giá × cardId: xem `Integration_V3_Buycard.pdf` mục **IV. Reference**.

---

## Sandbox credentials (từ tài liệu eSale)

| Field | Sandbox |
|-------|---------|
| URL | `https://partner3sb-esale.zing.vn/esale/cardshop/` |
| `agencyCode` | `9014780450` (shared — balance có thể thay đổi) |
| `clientCode` | eSale cung cấp |
| `SecretKey` | eSale cung cấp |
| RSA | Client gửi public key + IP; eSale gửi public key verify response |

---

## Related

- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md) — CardOn integration overview
- [04_ESALE_TOPUP_API.md](./04_ESALE_TOPUP_API.md) — Topup API
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
