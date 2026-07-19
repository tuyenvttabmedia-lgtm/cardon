# Phase 2E.2 — MegaPay Payment Adapter

> Date: 2026-06-18  
> Scope: MegaPay adapter only (`src/modules/payment/providers/megapay/`)  
> Not included: SePay, Provider/eSale, Fulfillment, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:payment` | **PASS (35/35)** |
| Tasks completed | **8/8** |

---

## Deliverables

### TASK 1: MegaPayProvider

| Method | Status | Notes |
|--------|--------|-------|
| `createPayment()` | **DONE** | Gọi MegaPay checkout API |
| `verifyWebhook()` | **DONE** | HMAC verify + status mapping |
| `queryTransaction()` | **DONE** | GET query endpoint |
| `refund()` | **PLACEHOLDER** | Trả `{ success: false }` — phase sau |

**Files:**

- `src/modules/payment/providers/megapay/megapay.provider.ts`
- `src/modules/payment/providers/megapay/megapay.client.ts`
- `src/modules/payment/providers/megapay/megapay.config.ts`
- `src/modules/payment/providers/megapay/megapay.signature.ts`
- `src/modules/payment/providers/megapay/megapay.types.ts`

---

### TASK 2: Configuration

| ENV Variable | Loaded via |
|--------------|------------|
| `MEGAPAY_MERCHANT_ID` | `configuration.ts` → `MegapayConfigService` |
| `MEGAPAY_SECRET_KEY` | Request signing |
| `MEGAPAY_ENDPOINT` | API base URL |
| `MEGAPAY_RETURN_URL` | Customer redirect |
| `MEGAPAY_WEBHOOK_SECRET` | Webhook verification |
| `MEGAPAY_CALLBACK_URL` | Optional override |
| `APP_PUBLIC_URL` | Default callback builder |

Không hardcode credentials. Thiếu config → `getConfig()` throw error rõ ràng.

**Docs:** `docs/04_MEGAPAY_INTEGRATION.md`

---

### TASK 3: Payment Request Mapping

```
CardOn payment_reference  →  MegaPay order_id
```

| MegaPay field | CardOn source |
|---------------|---------------|
| `amount` | Order total (VND integer) |
| `description` | `CardOn order {payment_reference}` |
| `return_url` | `MEGAPAY_RETURN_URL` |
| `callback_url` | `MEGAPAY_CALLBACK_URL` hoặc default webhook URL |

---

### TASK 4: Signature

| Flow | Algorithm | Secret |
|------|-----------|--------|
| Create / Query request | HMAC-SHA256 hex | `MEGAPAY_SECRET_KEY` |
| Webhook verify | HMAC-SHA256 hex | `MEGAPAY_WEBHOOK_SECRET` |

- Canonical string: sort keys → `key=value&...`
- `timingSafeEqual` cho webhook compare
- Invalid signature → `UnauthorizedException` (401)

---

### TASK 5: Webhook Status Mapping

| MegaPay status | CardOn action |
|----------------|---------------|
| `SUCCESS` | Atomic claim → payment SUCCESS → order PAID |
| `FAILED` | Atomic claim → payment FAILED |
| `PENDING`, `UNKNOWN` | HTTP 200, **không** đổi trạng thái |

**PaymentService update:** Early return khi `verification.status === 'PENDING'`.

---

### TASK 6: Query Transaction

`GET {ENDPOINT}/v1/checkout/query?merchant_id&order_id&signature`

Dùng cho manual reconciliation và webhook-missing recovery.  
Public qua `PaymentProviderInterface.queryTransaction()`.

---

### TASK 7: Logging

**Không log:** secret, signature, customer PII.

**Log (MegapayHttpClient):**

```
MegaPay {action} request_id=... payment_reference=... status=...
```

---

### TASK 8: Tests

| Suite | Tests | Coverage |
|-------|-------|----------|
| `megapay.provider.spec.ts` | 10 | create, signature, webhook SUCCESS/FAILED/PENDING, invalid sig, query, refund |
| `payment.service.spec.ts` | 12 | Core flow + PENDING webhook no-op |
| `payment.audit.spec.ts` | 13 | Safety audit (unchanged behavior) |

Mock HTTP qua `fetch` inject vào `MegapayHttpClient`.  
Payment Core tests dùng `PaymentProviderRegistry.withProviders(MockMegaPay, MockSePay)` — không phụ thuộc ENV MegaPay.

---

## Wiring

| Component | Change |
|-----------|--------|
| `PaymentProviderRegistry` | Inject `MegaPayProvider` (production), `MockSePayProvider` (SePay phase sau) |
| `PaymentModule` | Register `MegapayConfigService`, `MegapayHttpClient`, `MegaPayProvider` |
| `payment-provider.interface.ts` | `WebhookVerificationResult.status` thêm `'PENDING'` |

---

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total
```

| Before 2E.2 | After 2E.2 |
|-------------|------------|
| 25 tests | 35 tests (+10 MegaPay adapter) |

---

## Out of Scope (Confirmed)

- SePay adapter
- Provider / eSale integration
- Fulfillment
- Agent API
- Frontend

---

## Next Phase Suggestion

**Phase 2E.3 — SePay Payment Adapter** (khi owner yêu cầu)

---

## Sign-off

| Item | Status |
|------|--------|
| MegaPayProvider implements interface | **PASS** |
| ENV configuration | **PASS** |
| Request signing + webhook verify | **PASS** |
| Status mapping | **PASS** |
| queryTransaction | **PASS** |
| Safe logging | **PASS** |
| Tests | **PASS (35/35)** |
| Build | **PASS** |

**Phase 2E.2 MegaPay Adapter: FULL PASS**
