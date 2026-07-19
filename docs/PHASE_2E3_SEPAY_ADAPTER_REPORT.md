# Phase 2E.3 — SePay Payment Adapter

> Date: 2026-06-18  
> Scope: SePay adapter only (`src/modules/payment/providers/sepay/`)  
> Not included: Provider/eSale, Fulfillment, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:payment` | **PASS (49/49)** |
| Tasks completed | **10/10** |

---

## Deliverables

### TASK 1: SePayProvider

| Method | Status | Notes |
|--------|--------|-------|
| `createPayment()` | **DONE** | VietQR qua `qr.sepay.vn` |
| `verifyWebhook()` | **DONE** | API Key + HMAC, match transfer content |
| `queryTransaction()` | **DONE** | Foundation — trả PENDING cho reconcile phase |
| `refund()` | **PLACEHOLDER** | Phase sau |

**Files:**

- `src/modules/payment/providers/sepay/sepay.provider.ts`
- `src/modules/payment/providers/sepay/sepay.config.ts`
- `src/modules/payment/providers/sepay/sepay.auth.ts`
- `src/modules/payment/providers/sepay/sepay.qr.ts`
- `src/modules/payment/providers/sepay/sepay.types.ts`

---

### TASK 2: Configuration

| ENV Variable | Purpose |
|--------------|---------|
| `SEPAY_API_KEY` | `Authorization: Apikey {key}` |
| `SEPAY_WEBHOOK_SECRET` | HMAC-SHA256 (optional) |
| `SEPAY_BANK_ACCOUNT` | Số tài khoản QR |
| `SEPAY_BANK_CODE` | Mã/tên ngân hàng |
| `SEPAY_ACCOUNT_NAME` | Tên chủ TK |
| `SEPAY_QR_TEMPLATE` | `compact` / `qronly` / `standee` |

Không hardcode credentials.

**Docs:** `docs/04_SEPAY_INTEGRATION.md`

---

### TASK 3: Create Payment (Bank QR)

```
Transfer content: CARDON {payment_reference}
QR URL: https://qr.sepay.vn/img?acc=...&bank=...&amount=...&des=...
```

**Response `rawResponse`:**

| Field | Mô tả |
|-------|-------|
| `qr_url` | URL ảnh VietQR |
| `bank_info` | bankCode, accountNumber, accountName |
| `amount` | VND integer |
| `expired_at` | ISO timestamp từ order expiry |
| `transferContent` | Nội dung CK |

---

### TASK 4: Webhook Verification

| Method | Header |
|--------|--------|
| API Key | `Authorization: Apikey {SEPAY_API_KEY}` |
| HMAC | `X-SePay-Signature` + `X-SePay-Timestamp` + raw body |

Invalid auth → `401 Unauthorized`.

Tham chiếu: [SePay Xác thực](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)

---

### TASK 5: Transaction Matching

| SePay field | CardOn |
|-------------|--------|
| `id` | `providerTransactionId` |
| `transferAmount` | Amount validation (exact) |
| `content` | Parse `CARDON PAY-...` → `payment_reference` |

`assertWebhookAmountMatches()` trên SUCCESS — amount phải khớp chính xác order.

---

### TASK 6: Webhook Mapping

| Scenario | Action |
|----------|--------|
| `transferType=in` + matched ref + đúng amount | SUCCESS → PAID |
| Unknown transfer content | Log webhook, **200 OK**, không đổi state |
| `transferType=out` / không match | PENDING — no final action |

**PaymentService:** `verification.unknownReference` → early return OK.

---

### TASK 7: Duplicate Handling

- Lưu `sepayTransactionId` vào `gatewayResponse` khi mark SUCCESS
- `PaymentRepository.findSuccessByProviderTransactionId()` — JSON path lookup
- Duplicate `id` hoặc payment đã SUCCESS → **200 OK**, không reprocess

Theo khuyến nghị SePay: dùng `id` làm khóa chống trùng.

---

### TASK 8: Query Transaction

Foundation: trả `PENDING` — kết nối SePay Transactions API trong reconcile phase.

---

### TASK 9: Security Logging

**Không log:** API key, webhook secret, thông tin NH nhạy cảm.

**Log:** `transaction_id`, `payment_reference`, `amount`, `status`.

---

### TASK 10: Tests

| Suite | Tests | Coverage |
|-------|-------|----------|
| `sepay.provider.spec.ts` | 9 | Create QR, valid/invalid auth, HMAC, unknown ref, query, refund |
| `payment.sepay-webhook.spec.ts` | 5 | Valid webhook, invalid token, wrong amount, unknown ref, duplicate tx |
| Existing payment suites | 35 | MegaPay + Core + Audit (unchanged) |

---

## Wiring Changes

| Component | Change |
|-----------|--------|
| `PaymentProviderRegistry` | Inject `SePayProvider` (thay MockSePay) |
| `PaymentModule` | Register `SepayConfigService`, `SePayProvider` |
| `PaymentService` | `unknownReference`, duplicate tx id, merge `sepayTransactionId` |
| `PaymentRepository` | `findSuccessByProviderTransactionId()` |
| `CreateProviderPaymentParams` | Thêm `expiresAt?` cho QR expiry |

---

## Test Results

```
Test Suites: 5 passed, 5 total
Tests:       49 passed, 49 total
```

| Before 2E.3 | After 2E.3 |
|-------------|------------|
| 35 tests | 49 tests (+14 SePay) |

---

## Out of Scope (Confirmed)

- Provider / eSale integration
- Fulfillment
- Agent API
- Frontend

---

## Next Phase Suggestion

**Phase 2F — Provider / eSale Integration** (khi owner yêu cầu)

---

## Sign-off

| Item | Status |
|------|--------|
| SePayProvider implements interface | **PASS** |
| ENV configuration | **PASS** |
| Bank QR create payment | **PASS** |
| Webhook auth + matching | **PASS** |
| Unknown ref + duplicate tx | **PASS** |
| Safe logging | **PASS** |
| Tests | **PASS (49/49)** |
| Build | **PASS** |

**Phase 2E.3 SePay Adapter: FULL PASS**
