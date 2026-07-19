# Phase 5C.1 — Admin API Completion Report

**Date:** 2026-06-18  
**Scope:** Hoàn thiện Admin API, gỡ workaround frontend, không redesign UI, không thêm business feature mới.

---

## Kết quả tổng quan

| Check | Mô tả | Kết quả |
|-------|--------|---------|
| 1 | `GET /admin/products` | **PASS** |
| 2 | `GET /admin/payments` (filter + pagination) | **PASS** |
| 3 | Provider ops (transactions, sync, balance) | **PASS** |
| 4 | Security (secrets, cost RBAC) | **PASS** |
| 5 | Frontend — admin API only | **PASS** |
| 6 | Tests + build | **PASS** |

---

## CHECK 1 — Admin product API

### Endpoint mới

```
GET /api/v1/admin/products
Permission: products.manage
```

### Response

- Toàn bộ sản phẩm (kể cả `INACTIVE`)
- Variants kèm `providerMappings` và thông tin provider (`id`, `code`, `name`)
- `providerCost` chỉ có trên endpoint admin (permission `products.manage`)

### Files

- `src/modules/product/repositories/product.repository.ts` — `findManyAdmin()`
- `src/modules/product/entities/product.mapper.ts` — `mapAdminProduct`, `mapAdminVariant`
- `src/modules/product/services/product.service.ts` — `listAdminProducts()`
- `src/modules/product/controllers/product-admin.controller.ts` — `@Get()`

### Frontend

- `apps/admin/app/products/page.tsx` — dùng `productAdminApi.listProducts()` thay `catalogApi`
- `catalogApi` đã xóa khỏi `apps/admin/services/api-client.ts`

---

## CHECK 2 — Admin payment list

### Endpoint mới

```
GET /api/v1/admin/payments
Permission: payments.view
```

### Filters

| Param | Mô tả |
|-------|--------|
| `gateway` | MEGAPAY, SEPAY |
| `status` | PENDING, SUCCESS, FAILED, EXPIRED |
| `dateFrom` / `dateTo` | ISO date trên `createdAt` |
| `amount` | Khớp chính xác số tiền |
| `skip` / `take` | Pagination (max 100) |

### Response

```json
{ "items": [...], "total": 42 }
```

### Files

- `src/modules/admin/dto/admin.dto.ts` — `AdminPaymentQueryDto`
- `src/modules/admin/repositories/admin.repository.ts` — `findPaymentsAdmin`, `countPaymentsAdmin`
- `src/modules/admin/services/admin-payment.service.ts` — `listPayments()`
- `src/modules/admin/controllers/admin.controller.ts` — `@Get('payments')`

### Frontend

- `apps/admin/app/payments/page.tsx` — danh sách payment có filter + phân trang (permission `payments.view`)
- Manual review giữ nguyên (permission `payments.review`)

---

## CHECK 3 — Provider operations

### Endpoints mới

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/admin/providers/:id/transactions` | Danh sách transaction (pagination) |
| POST | `/admin/providers/:id/sync-products` | Gọi adapter `syncProducts()` |
| POST | `/admin/providers/:id/check-balance` | Gọi `ProviderHealthService.syncProviderBalance()` |

Permission: `providers.manage`

### Files

- `src/modules/admin/services/admin-provider.service.ts` — logic mới
- `src/modules/provider/repositories/provider.repository.ts` — `findManyByProviderAdmin`, `countByProviderAdmin`
- `src/modules/provider/provider.module.ts` — export `ProviderHealthService`, `ProviderRepository`, `ProviderTransactionRepository`
- `src/modules/admin/entities/admin-provider-transaction.mapper.ts` — sanitize payload

### Frontend

- `apps/admin/app/providers/page.tsx` — nút Check balance, Sync products, xem Transactions

---

## CHECK 4 — Security

| Rủi ro | Biện pháp |
|--------|-----------|
| Provider secrets trong transaction payload | `sanitizeProviderPayload()` redact key matching `secret`, `password`, `apiKey`, `token`, `pin`, `serial` |
| Provider cost lộ ra public | Public `GET /products` không có mappings/cost; cost chỉ qua `GET /admin/products` + `products.manage` |
| Provider config secrets | `listProviderStatus` chỉ select `id`, `code`, `name`, `balance`, `status` — không trả `config` |

Tests: `admin.completion.spec.ts` — sanitize + permission denied.

---

## CHECK 5 — Frontend update

| Trước | Sau |
|-------|-----|
| Products dùng `catalogApi.listProducts()` (public API) | `productAdminApi.listProducts()` |
| Payments chỉ manual review | Thêm list qua admin API |
| Providers chỉ xem status | Thêm sync balance/products + transactions |

---

## CHECK 6 — Tests & Build

### Tests

```powershell
npm run test:admin
# 3 suites, 33 tests — PASS
```

File mới: `src/modules/admin/admin.completion.spec.ts`

- Admin product list (inactive + mappings)
- Payment pagination
- Provider sync
- Permission denied
- Payload sanitization

### Build

```powershell
npm run build          # nest build — PASS
npm run build:admin    # apps/admin Next.js — PASS (13 routes)
```

---

## Không thực hiện (theo yêu cầu)

- Không redesign UI
- Không thêm business feature mới
- Không deployment

---

## Ghi chú kỹ thuật

- Route order: `GET payments/manual-review` đặt trước `GET payments`; `GET providers/status` đặt trước `GET providers/:id/transactions`
- `GET /admin/products` đặt sau `GET categories`, trước các route `:id` parameterized
- Pagination dùng chung `resolveAdminPagination` (default 50, max 100)
