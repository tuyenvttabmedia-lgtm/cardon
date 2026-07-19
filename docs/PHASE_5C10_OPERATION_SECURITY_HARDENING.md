# Phase 5C.10 — Operation Security Hardening

**Ngày:** 2026-06-18  
**Trạng thái:** ✅ Hoàn thành  
**Phạm vi:** Sửa 3 finding Phase 5C.9 (F-5C9-01 … F-5C9-03). **Không đổi** payment flow, provider flow, ledger logic, không thêm business feature.

---

## Tóm tắt

| Task | Finding | Kết quả |
|------|---------|---------|
| TASK 1 | F-5C9-01 PIN reveal | ✅ Permission `cards.reveal` + audit `CARD_PIN_REVEALED` |
| TASK 2 | F-5C9-02 Gateway raw JSON | ✅ `sanitizeGatewayPayload()` trên output |
| TASK 3 | F-5C9-03 Global search | ✅ Lọc section theo permission caller |
| TASK 4 | Regression | ✅ 34 suites, 363 tests PASS |

---

## TASK 1 — Card PIN reveal permission

### Permission mới

| Code | Mô tả | Gán cho |
|------|-------|---------|
| `cards.reveal` | Hiện PIN thẻ trong order detail | ADMIN, SUPER_ADMIN |

**Không gán:** SUPPORT, ACCOUNTANT, MARKETING.

### Quy tắc API

`GET /admin/orders/:id/detail`:

- `orders.read` — xem order trace; serial & PIN đều masked (`******`)
- `?revealPins=true` — yêu cầu thêm `cards.reveal`; nếu thiếu → **403 Forbidden**

### Audit

Khi PIN được reveal:

- Action: `CARD_PIN_REVEALED`
- Target: ORDER
- Metadata: `{ timestamp: ISO8601 }`
- Actor: admin user id

### UI Admin

`apps/admin/app/orders/[id]/page.tsx`:

- Nút **"Hiện mã thẻ"** / **"Ẩn mã thẻ"** chỉ hiện khi `can('cards.reveal')`
- Field response: `serialMasked`, `pinMasked`

### Deploy

Chạy lại seed permissions sau deploy (`cards.reveal`).

---

## TASK 2 — Sanitize gateway raw response

### Hàm mới

`src/modules/payment/entities/gateway-payload-safety.ts` — `sanitizeGatewayPayload()`

Mask key chứa (case-insensitive): `secret`, `token`, `key`, `signature`, `password`, `credential`, `auth`  
Giá trị mask: `********`

**Chỉ sanitize output** — không sửa dữ liệu lưu DB.

### Áp dụng

| Vị trí | File |
|--------|------|
| Admin order detail payment trace | `admin-order-detail.mapper.ts` |
| Manual review queue payments | `payment.service.ts` → `listManualReviewQueue()` |
| Webhook logs (unknown webhooks) | `payment.service.ts` → `listManualReviewQueue()` |

Thay thế `sanitizeGatewayResponseForAdmin()` (chỉ ẩn `lateWebhookPayload`).

---

## TASK 3 — Permission-aware global search

### API

`GET /admin/search?q=` — guard: **bất kỳ** permission search nào (`orders.read`, `customers.read`, `payments.view`, `providers.manage`, `finance.view`, `users.read`).

`AdminSearchService.search(q, permissions)` — chỉ query & trả section khi caller có quyền:

| Permission | Section |
|------------|---------|
| `orders.read` | `orders` |
| `customers.read` | `customers` |
| `users.read` | `staff` |
| `payments.view` | `payments` |
| `providers.manage` | `providerTransactions` |
| `finance.view` | `finance` (placeholder `[]`, chưa có nguồn search) |

Không có quyền → section rỗng `[]`. Repository `globalSearch()` skip query DB khi scope tắt.

### Kết quả mong đợi

| Role | orders | customers | payments | finance |
|------|--------|-----------|----------|---------|
| MARKETING | ❌ | ❌ | ❌ | ❌ |
| ACCOUNTANT | ✅ | ❌ | ✅ | ✅ (empty) |
| SUPPORT | ✅ | ✅ | ✅ | ❌ |

---

## TASK 4 — Tests

### File mới

`src/modules/admin/admin-operation.security.spec.ts`:

- PIN reveal denied / allowed + audit
- Serial & PIN masked mặc định
- Gateway payload sanitization
- Search filtering: MARKETING, ACCOUNTANT, SUPPORT

### Regression

```text
npm run build          → PASS
npm run build:web      → PASS
npm run build:partner  → PASS
npm run build:admin    → PASS
npm test               → 34 suites, 363 tests PASS
```

---

## Files thay đổi

```
prisma/seed.mjs
src/modules/payment/entities/gateway-payload-safety.ts
src/modules/payment/services/payment.service.ts
src/modules/admin/entities/admin.constants.ts
src/modules/admin/entities/admin-order-detail.mapper.ts
src/modules/admin/services/admin-order-detail.service.ts
src/modules/admin/services/admin-search.service.ts
src/modules/admin/repositories/admin.repository.ts
src/modules/admin/controllers/admin-operation.controller.ts
src/modules/admin/admin.module.ts
src/modules/admin/admin-operation.spec.ts
src/modules/admin/admin-operation.security.spec.ts
apps/admin/app/orders/[id]/page.tsx
apps/admin/types/api.ts
```

---

## Kết luận

Phase 5C.10 đóng 3 gap bảo mật vận hành từ 5C.9. SUPPORT không thể reveal PIN; gateway JSON và webhook logs được mask trên output; global search tuân thủ RBAC theo từng section.

**Lưu ý deploy:** Re-seed permissions để gán `cards.reveal` cho ADMIN/SUPER_ADMIN.
