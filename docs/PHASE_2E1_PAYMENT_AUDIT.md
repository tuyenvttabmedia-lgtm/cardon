# Phase 2E.1 — Payment Safety Audit

> Date: 2026-06-18  
> Scope: Audit only — Payment Core (`src/modules/payment/`)  
> Not included: MegaPay/SePay real API, Provider, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:payment` | **PASS (25/25)** |
| Critical fixes | **5** |

---

## Audit Checks

### CHECK 1: Webhook duplicate protection

**Scenario:** Provider gửi SUCCESS webhook 2 lần.

| Lần | Expected | Result |
|-----|----------|--------|
| 1 | payment → SUCCESS, order → PAID | **PASS** |
| 2 | 200 OK, no reprocess | **PASS** |
| 2 | No duplicate audit event | **PASS** (fix: bỏ `PAYMENT_DUPLICATE_WEBHOOK` trên duplicate) |

**Evidence:** `payment.audit.spec.ts`, `payment.service.spec.ts`

---

### CHECK 2: Payment amount validation

**Scenario:** Order 100,000 — webhook amount 90,000.

| Item | Result |
|------|--------|
| `assertWebhookAmountMatches()` | **PASS** (mới thêm) |
| Reject before mark PAID | **PASS** |
| `BadRequestException` | **PASS** |

**Critical fix:** Validation amount bắt buộc trên SUCCESS webhook.

---

### CHECK 3: Expired payment — late SUCCESS

**Scenario:** Payment expired, provider gửi SUCCESS muộn.

| Item | Result |
|------|--------|
| Không mark order PAID | **PASS** |
| Không mark payment SUCCESS | **PASS** |
| MANUAL_REVIEW handling | **PASS** — `gatewayResponse.manualReview = true` |
| Return HTTP 200 | **PASS** — `{ ok: true, manualReview: true }` |

**Documented:** `entities/payment-refund.rules.ts` → `PAYMENT_LATE_WEBHOOK_RULES`

---

### CHECK 4: Invalid webhook

| Case | Expected | Result |
|------|----------|--------|
| Wrong signature | Reject (401) | **PASS** |
| Unknown payment_reference | Reject (404) | **PASS** |

---

### CHECK 5: Race condition

**Scenario:** 2 SUCCESS webhook đồng thời.

| Item | Result |
|------|--------|
| `claimPendingStatus()` — `updateMany WHERE status=PENDING` | **PASS** (mới thêm) |
| Chỉ 1 claim thành công | **PASS** |
| Loser → duplicate response, no double PAID | **PASS** |

**Critical fix:** Atomic claim thay cho read-then-update.

---

### CHECK 6: Payment success + order update atomicity

**Scenario:** Payment PAID nhưng order update fail → inconsistent state.

| Item | Result |
|------|--------|
| Single `prisma.$transaction` | **PASS** (fix) |
| `claimPendingStatus` + `markPaidInTransaction` cùng tx | **PASS** |
| Rollback nếu order update fail | **PASS** (Prisma transaction) |

**Critical fix:** `OrderService.markPaidInTransaction(tx, ...)` gọi trong cùng transaction.

---

### CHECK 7: payment_reference uniqueness

| Item | Result |
|------|--------|
| `@unique` on `payments.payment_reference` | **PASS** (schema) |
| DB index | **PASS** |

---

### CHECK 8: Refund preparation

| Future state | Documented |
|--------------|------------|
| `REFUND_PENDING` | **PASS** |
| `REFUNDED` | **PASS** |

**File:** `entities/payment-refund.rules.ts` — chưa implement refund.

---

## Critical Fixes Applied

| # | Issue | Fix |
|---|-------|-----|
| 1 | Không validate webhook amount | `assertWebhookAmountMatches()` |
| 2 | Payment/order update không atomic | Single transaction + `markPaidInTransaction` |
| 3 | Race condition double webhook | `claimPendingStatus()` updateMany |
| 4 | Expired late SUCCESS throw error | MANUAL_REVIEW + 200 OK |
| 5 | Duplicate webhook ghi audit spam | Bỏ audit trên idempotent duplicate |

---

## Test Results

**Command:** `npm run test:payment`

| Suite | Tests | Result |
|-------|-------|--------|
| `payment.service.spec.ts` | 15 | **PASS** |
| `payment.audit.spec.ts` | 10 | **PASS** |
| **Total** | **25** | **PASS** |

**Build:** `npm run build` — **PASS**

---

## Findings (Non-Blocking)

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | MANUAL_REVIEW chưa có admin UI | Info | Phase admin dashboard |
| 2 | `PAYMENT_DUPLICATE_WEBHOOK` audit removed | Info | webhook_logs đủ trace |
| 3 | Refund enum chưa trong schema | Info | Migration khi implement refund |

---

## Intentionally Not Started

- MegaPay / SePay real integration
- Provider fulfillment
- Agent API
- Frontend

---

**Phase 2E.1: COMPLETE — FULL PASS**
