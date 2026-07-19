# Phase 6G.1 — Fulfillment Pipeline Fix

**Ngày:** 2026-06-21  
**Phạm vi:** Sửa P0 blocker — order `PAID/PROCESSING` không giao thẻ sau SePay webhook.  
**Không đổi:** payment logic, pricing, ledger, frontend, provider business rules (buyCard/checkTransaction).

---

## Root cause

Luồng lỗi (Phase 6G regression):

1. SePay webhook → order **PAID** ✅  
2. `provider_queue` job enqueued ✅  
3. Worker `ProviderWorker` nhận job ✅  
4. `claimFulfillmentProcessing` → order **PROCESSING** ✅  
5. `ProviderAuditService.recordAttempt()` → **throw** vì thiếu user `system@cardon.local` ❌  
6. Không tạo `provider_transactions` / `card_records`  
7. Job retry → `recoverProcessingOrder()` throw `ConflictException` (PROCESSING không có txn recoverable)  
8. Vòng lặp retry vô hạn, order kẹt mãi

**Seed gap:** `create-smoke-data.ts` có `ensureSystemAuditActor()` nhưng `seed-local-full.ts` và `prisma/seed.mjs` **không** tạo actor này.

---

## Fixes applied

### 1. Bootstrap system audit actor

| File | Thay đổi |
|------|----------|
| `prisma/seed.mjs` | Upsert `system@cardon.local` (ADMIN) mỗi lần seed |
| `scripts/seed-local-full.ts` | `ensureSystemAuditActor()` + `resetZombieProcessingOrders()` |

Zombie reset: order `PROCESSING` + `provider_transactions` count = 0 → reset về `PENDING` (giống smoke script).

### 2. Zombie PROCESSING recovery (worker restart)

`ProviderService.recoverProcessingOrder()`:

- Nếu có txn recoverable → recover như cũ  
- Nếu **không** có txn (zombie) → log warning + **retry `executeBuyCardAttempt`** (không cần sửa DB thủ công)

Cho phép order kẹt từ Phase 6G tự phục hồi khi worker xử lý job lại.

### 3. Debug logs (TASK 1 & 2)

| Component | Log |
|-----------|-----|
| `PaymentService` | `Payment success enqueued fulfillment orderId=… paymentReference=… queueJobId=…` |
| `ProviderQueueProducer` | `Enqueued provider_queue jobId=… orderId=… triggeredBy=…` |
| `ProviderWorker` | `ProviderWorker ready` (startup) |
| `ProviderWorker.process` | `Processing … orderId=… queueJobId=…` |

### 4. Queue payload (TASK 3)

Đã xác nhận producer/consumer dùng cùng DTO:

```typescript
{ orderId: string; triggeredBy: 'webhook' | 'manual' | 'agent'; attempt?: number }
```

Job name: `PROVIDER_QUEUE_JOB.FULFILL` — không mismatch `order_id` vs `orderId`.

### 5. Provider mappings (TASK 4)

Seed `seed-local-full.ts` đã có mappings ACTIVE cho:

| SKU | providerProductCode |
|-----|---------------------|
| VIETTEL-100K | `VIETTEL\|100000\|Card` |
| GARENA-100K | `GARENA\|100000\|Card` |
| ZING-100K | `ZING\|100000\|Card` |

Provider: **ESALE** (Mock khi `ESALE_USE_MOCK=true`).

---

## Expected flow (TASK 5)

```
SePay webhook SUCCESS
  → order PAID
  → provider_queue job
  → ProviderWorker.process
  → claimFulfillmentProcessing (PENDING → PROCESSING)
  → provider_transactions PROCESSING
  → MockESale buyCard
  → card_records
  → order COMPLETED
```

---

## Tests (TASK 7)

**File mới:** `src/modules/provider/provider.fulfillment-pipeline.spec.ts`

| Test | Mô tả |
|------|-------|
| creates provider transaction and card records | PAID + PENDING → COMPLETED |
| recovers zombie PROCESSING | PROCESSING, 0 txn → COMPLETED |

```bash
npm test   # 369 passed (35 suites)
npm run build   # nest build OK
```

---

## Deploy local-full

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api worker

# Seed (nếu stack đã chạy)
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
```

**E2E verify (2026-06-21 post-fix):**

| Bước | Kết quả |
|------|---------|
| Buy GARENA-100K + SePay webhook | ✅ |
| Order `ORD-20260621-2FF515` | **PAID / COMPLETED** |
| `provider_transactions` | 1 row |
| Card serial + PIN | ✅ |
| Worker startup | `ProviderWorker ready` |
| Zombie reset | `ORD-20260621-661D56` → PENDING |

---

**Trạng thái:** P0 fix hoàn tất — verified E2E local-full.

```
src/modules/provider/services/provider.service.ts      — zombie recovery
src/modules/provider/services/provider-queue.producer.ts — logs + return jobId
src/modules/provider/workers/provider.worker.ts        — onModuleInit + logs
src/modules/payment/services/payment.service.ts        — enqueue debug log
prisma/seed.mjs                                        — system audit actor
scripts/seed-local-full.ts                             — audit actor + zombie reset
src/modules/provider/provider.fulfillment-pipeline.spec.ts — regression tests
src/modules/payment/payment.service.spec.ts            — mock jobId
```

---

## Files changed
