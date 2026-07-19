# Phase 2F.2 — Provider Safety Audit

> Date: 2026-06-19  
> Scope: Audit only — Provider Core + eSale adapter (`src/modules/provider/`)  
> Not included: Agent API, Admin UI, Frontend, new providers

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:provider` | **PASS (51/51)** |
| Critical fixes | **3** |

---

## Audit Checks

### CHECK 1: Duplicate fulfillment protection

**Scenario:** `provider_queue` job chạy 2 lần cho cùng order.

| Item | Expected | Result |
|------|----------|--------|
| Không gọi eSale buyCard 2 lần | Atomic claim | **PASS** (fix) |
| `card_records` đã tồn tại → skip buyCard | Idempotent | **PASS** (fix) |
| Order COMPLETED → return sớm | No re-fulfill | **PASS** |
| Claim fail + PROCESSING → Conflict | Block duplicate | **PASS** (fix) |

**Critical fixes:**
1. Kiểm tra `claimFulfillmentProcessing().count === 0` trước khi gọi provider
2. Kiểm tra `card_records` count > 0 → return COMPLETED
3. Claim chuyển order sang `PROCESSING` — job thứ 2 không pass allowed status

**Evidence:** `provider.safety.spec.ts` — CHECK 1

---

### CHECK 2: eSale success but network lost

**Scenario:** buyCard timeout sau khi eSale đã trừ tiền.

| Item | Expected | Result |
|------|----------|--------|
| `checkTransaction()` recovery | **PASS** |
| Không gọi buyCard lại | 1 buyCard + 1 check | **PASS** |
| PENDING retCode cũng trigger check | **PASS** (Phase 2F.1) |

**Evidence:** `provider.safety.spec.ts` — CHECK 2, `provider.service.spec.ts`

**Known limitation (non-critical):** ~~eSale transaction context in-memory~~ **RESOLVED in Phase 2F.3** — see [PHASE_2F3_PROVIDER_PERSISTENCE_REPORT.md](./PHASE_2F3_PROVIDER_PERSISTENCE_REPORT.md).

---

### CHECK 3: Manual retry safety

**Scenario:** Admin retry khi đã có SUCCESS transaction.

| Item | Expected | Result |
|------|----------|--------|
| Không gọi buyCard nếu prior SUCCESS | **PASS** (fix) |
| Gọi `checkTransaction` với requestId cũ | **PASS** (fix) |
| Apply cards nếu recover được | **PASS** |

**Critical fix:** `findLatestSuccess()` + `recoverFromPriorSuccess()` trước buyCard.

**Evidence:** `provider.safety.spec.ts` — CHECK 3

---

### CHECK 4: Quantity validation

**Scenario:** Order quantity=10, eSale trả 9 cards.

| Item | Expected | Result |
|------|----------|--------|
| Không mark COMPLETED | **PASS** (fix) |
| `WAITING_ADMIN_RETRY` | **PASS** (fix) |
| Không tạo `card_records` | **PASS** (fix) |
| Audit `QUANTITY_MISMATCH` | **PASS** (fix) |

**Critical fix:** Trước đây chỉ `logger.warn` nhưng vẫn COMPLETED — đã sửa reject partial delivery.

**Evidence:** `provider.safety.spec.ts` — CHECK 4

---

### CHECK 5: PIN encryption

| Item | Expected | Result |
|------|----------|--------|
| DB không lưu plain PIN | **PASS** |
| Format `iv:tag:ciphertext` (AES-256-GCM) | **PASS** |
| Decrypt chỉ qua `CardEncryptionService` | **PASS** |

**Evidence:** `card-encryption.service.ts`, `provider.safety.spec.ts` — CHECK 5

Customer/admin authorized decrypt — endpoint xem thẻ chưa implement (out of scope).

---

### CHECK 6: Provider balance low

**Scenario:** eSale balance < threshold.

| Item | Expected | Result |
|------|----------|--------|
| Notification ADMIN tạo | **PASS** |
| Bán hàng không bị disable | **PASS** |
| `providers.balance` cập nhật | **PASS** |

**Evidence:** `provider-health.service.ts`, `provider.safety.spec.ts` — CHECK 6

---

### CHECK 7: Product sync safety

**Scenario:** `syncProducts()` chạy.

| Allowed | Forbidden | Result |
|---------|-----------|--------|
| Catalog fetch count | Ghi `sell_price` | **PASS** |
| — | Ghi agent custom price | **PASS** |
| — | Auto DB mapping write | **PASS** (chỉ fetch, admin-driven) |

**Evidence:** `esale.provider.ts` — `syncProducts()`, `provider.safety.spec.ts` — CHECK 7

---

### CHECK 8: Provider transaction audit

| Item | Expected | Result |
|------|----------|--------|
| Mỗi attempt = row mới | **PASS** |
| `updateResult` chỉ update row hiện tại | **PASS** |
| History không bị overwrite | **PASS** |
| `audit_logs` qua ProviderAuditService | **PASS** |

**Evidence:** `provider.repository.ts`, `provider.safety.spec.ts` — CHECK 8

---

### CHECK 9: Card delivery atomicity

**Scenario:** Lưu 10 `card_records`, record 5 fail.

| Item | Expected | Result |
|------|----------|--------|
| `prisma.$transaction` rollback | **PASS** |
| Không partial COMPLETED | **PASS** |

**Evidence:** `provider.service.ts` — `$transaction` wraps createMany + status updates, `provider.safety.spec.ts` — CHECK 9

---

### CHECK 10: Security — logs

| Must NOT appear in logs | Result |
|-------------------------|--------|
| PIN plain | **PASS** |
| partner key / secretKey | **PASS** |
| private key | **PASS** |
| signature | **PASS** |

**Evidence:** `esale.client.ts` — `logSafe()` chỉ log endpoint + retCode + transId, `provider.safety.spec.ts` — CHECK 10

**Note:** `provider_logs.responsePayload` có thể chứa encrypted cardCode từ eSale (DB, không phải log) — acceptable.

---

## Critical Fixes Applied

| # | Issue | Fix | File |
|---|-------|-----|------|
| 1 | Race: duplicate queue job → double buyCard | Claim count check + card_records idempotency | `provider.service.ts` |
| 2 | Admin retry / prior SUCCESS → double buyCard | `findLatestSuccess` + skip buyCard | `provider.service.ts`, `provider.repository.ts` |
| 3 | Partial cards (9/10) still COMPLETED | Reject → WAITING_ADMIN_RETRY | `provider.service.ts` |

---

## Test Results

```
npm run build          → PASS
npm run test:provider  → 51 passed (5 suites)
  - provider.service.spec.ts     10
  - provider.safety.spec.ts      12  (new)
  - esale.provider.spec.ts       11
  - megapay/sepay (pattern)      18
```

---

## Out of Scope (Confirmed)

- Agent API / ledger finalize
- Admin retry HTTP endpoint
- Customer card view endpoint
- eSale transaction context persistence across worker restart
- Frontend / Admin UI

---

## Sign-off

| Item | Status |
|------|--------|
| Duplicate fulfillment protection | **PASS** |
| Timeout / checkTransaction recovery | **PASS** |
| Manual retry safety | **PASS** |
| Quantity validation | **PASS** |
| PIN encryption | **PASS** |
| Low balance notification | **PASS** |
| syncProducts safety | **PASS** |
| Transaction audit trail | **PASS** |
| Card delivery atomicity | **PASS** |
| Log security | **PASS** |
| Build + tests | **PASS (51/51)** |

**Phase 2F.2 Provider Safety Audit: FULL PASS**
