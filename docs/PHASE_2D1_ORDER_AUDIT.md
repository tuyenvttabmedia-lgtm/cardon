# Phase 2D.1 — Order Integrity Audit

> Date: 2026-06-18  
> Scope: Audit only — Order Core (`src/modules/order/`)  
> Not included: Payment, Provider, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:order` | **PASS** |
| Critical fixes | **2** |

---

## Audit Checks

### CHECK 1: Price snapshot protection

**Scenario:** Order tạo lúc giá 100,000 → admin đổi giá 120,000 → đơn cũ vẫn 100,000.

| Item | Result |
|------|--------|
| `unit_price` snapshot vào `order_items` lúc tạo | **PASS** |
| `total_amount` snapshot vào `orders` | **PASS** |
| API đọc đơn trả giá từ DB snapshot, không join live `sell_price` | **PASS** |

**Evidence:** `PricingService.getCustomerPrice()` chỉ gọi lúc create; `mapOrder()` đọc `order_items.unit_price`.

---

### CHECK 2: Double submit protection

**Scenario:** Customer bấm checkout 2 lần nhanh.

| Item | Result |
|------|--------|
| Idempotency trên POST /orders | **NOT IMPLEMENTED** (by design Phase 2D) |
| Mỗi submit tạo order + transaction mới | **Documented** |
| Payment phase idempotency | **Documented requirement** |

**Action:** Thêm `entities/order-idempotency.rules.ts` — yêu cầu `Idempotency-Key` + `payment_reference` ở phase Payment.

**Severity:** Info (không critical cho Order Core — Payment phase sẽ xử lý)

---

### CHECK 3: Guest security

**Scenario:** Guest lookup cần `order_code` + đúng `email`.

| Item | Result |
|------|--------|
| `findByCodeForGuest(orderCode, email)` | **PASS** |
| Case-insensitive email match | **PASS** |
| Sai email → `NotFoundException` (không leak) | **PASS** |
| Chỉ guest orders (`isGuestOrder = true`) | **PASS** |

---

### CHECK 4: Order ownership

**Scenario:** User A không xem được đơn User B.

| Item | Result |
|------|--------|
| `GET /orders/:id` filter `userId` | **PASS** |
| `findByIdForUser(id, userId)` | **PASS** |
| Không match → `NotFoundException` | **PASS** |

---

### CHECK 5: Completed order immutability

**Scenario:** Sau fulfillment COMPLETED — không sửa amount, quantity, variant.

| Item | Result |
|------|--------|
| Không có endpoint sửa order_items | **PASS** (N/A) |
| `assertOrderItemsFrozen()` — PAID / COMPLETED | **PASS** (mới thêm) |
| `assertCanModifyOrderMetadata()` — chặn note sau PAID | **PASS** (fix critical) |
| Frozen fields documented | **PASS** |

**Critical fix:** `updateCustomerNote()` trước đây chỉ chặn COMPLETED — giờ chặn cả **PAID** (theo `DATA_RETENTION_RULES.md`).

---

### CHECK 6: Payment expiration

**Scenario:** WAITING_PAYMENT + hết hạn → EXPIRED; EXPIRED không thể PAID.

| Item | Result |
|------|--------|
| `OrderExpirationService.expireOrder()` | **PASS** |
| `assertPaymentTransition`: EXPIRED → PAID blocked | **PASS** (explicit) |
| `assertCanMarkPaid()` for Payment phase | **PASS** (mới thêm) |

**Critical fix:** Thêm `assertCanMarkPaid()` — reject EXPIRED và past `payment_expires_at` trước khi Payment module mark PAID.

---

### CHECK 7: Invoice data snapshot

**Scenario:** Invoice info snapshot lúc checkout; đổi profile sau không ảnh hưởng đơn cũ.

| Item | Result |
|------|--------|
| `invoice_metadata` JSON lưu trên `orders` | **PASS** |
| Không đọc từ user profile | **PASS** |
| `companyName`, `taxCode`, `address` at create time | **PASS** |

---

### CHECK 8: Order audit logs

| Action | Result |
|--------|--------|
| `ORDER_CREATED` | **PASS** |
| `ORDER_EXPIRED` | **PASS** |
| Target type `AuditTargetType.ORDER` | **PASS** |

---

## Critical Fixes Applied

| # | Issue | Fix |
|---|-------|-----|
| 1 | Có thể sửa `customerNote` sau PAID | `assertCanModifyOrderMetadata()` — chặn PAID + COMPLETED |
| 2 | EXPIRED → PAID chưa explicit guard cho Payment | `assertCanMarkPaid()` + explicit terminal states trong `assertPaymentTransition` |

## Non-Critical Additions

| Change | Purpose |
|--------|---------|
| `order-idempotency.rules.ts` | CHECK 2 — idempotency requirement |
| `assertOrderItemsFrozen()` | CHECK 5 — guard cho future item updates |
| `order.audit.spec.ts` | Automated audit tests |

---

## Test Results

**Command:** `npm run test:order`

| Suite | Tests | Result |
|-------|-------|--------|
| `order.service.spec.ts` | 14 | **PASS** |
| `order.audit.spec.ts` | 15 | **PASS** |
| **Total** | **29** | **PASS** |

**Build:** `npm run build` — **PASS**

---

## Findings (Non-Blocking)

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | Double-click tạo 2 orders | Info | Payment phase: Idempotency-Key |
| 2 | Expiration worker chưa chạy | Info | BullMQ cron phase sau |
| 3 | `assertCanMarkPaid()` chưa wired PaymentService | Info | Gọi trong Payment webhook |

---

## Intentionally Not Started

- Payment module
- Provider API
- Agent API
- Frontend

---

**Phase 2D.1: COMPLETE — FULL PASS**
