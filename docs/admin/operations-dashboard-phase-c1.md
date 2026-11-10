# Cardon Admin — Operations Dashboard · Phase C1 (Backend)

**Ngày:** 2026-11-09  
**Trạng thái:** C1 backend hoàn thành · **chờ owner nghiệm thu** trước C2  
**Tham chiếu:** `docs/admin/operations-dashboard-phase-b.md` (+ bổ sung KPI B5/D1/D2)

---

## 1. Tổng quan implementation

Mở rộng `GET /admin/dashboard?period=today|last7|month` trên backend Nest hiện có (không tạo module dashboard trùng).

| Hạng mục | Kết quả |
|----------|---------|
| Period VN | `resolveDashboardPeriodRange` — `Asia/Ho_Chi_Minh`, `[fromInclusive, toExclusive)` |
| B1–B4 | Aggregate/count Order B2C retail · PAID + Payment SUCCESS `paidAt` ∈ kỳ · profit = sell − cost − fee |
| B5 / D1 | `payment.count` attempts · SUCCESS/`paidAt` · FAILED/`updatedAt` · scope qua `Payment.order` |
| D2 | `providerLog.count` FAILED theo `createdAt` · **SYSTEM** · `providerErrorsScope: 'SYSTEM'` |
| C1–C4 | Snapshot PAID backlog · tách 4 fulfillment status · không phụ thuộc period |
| Agent | `agent.groupBy(status)` snapshot · không phụ thuộc period |
| Health | Summary/status → `system.health.read` · unscanned → `null` + `scanAvailable: false` (không fake 100%) |
| RBAC | Seed/sync scripts thêm permission; gán ADMIN + SUPER_ADMIN |
| Legacy FE | Giữ `todayRevenue`, `ordersCount`, `successfulPayments`, `failedPayments`, `pendingFulfillment` |

**Không:** Prisma schema / migration · payment webhook/state machine · fulfillment worker · FE C2 · commit/deploy.

---

## 2. Danh sách file thay đổi

### Backend core
| File | Lý do |
|------|-------|
| `src/modules/admin/entities/dashboard-period.ts` | Normalize + resolve period VN |
| `src/modules/admin/entities/dashboard-retail-scope.ts` | Helper B2C + exclude admin-test + exclude ESIM |
| `src/modules/admin/dto/dashboard-query.dto.ts` | Query `period` (invalid → normalize `today`, không 400) |
| `src/modules/admin/repositories/admin.repository.ts` | `getDashboardStats(period)` aggregates song song |
| `src/modules/admin/services/admin-dashboard.service.ts` | Forward `period` |
| `src/modules/admin/controllers/admin.controller.ts` | `@Query() DashboardQueryDto` |
| `src/modules/admin/controllers/system-health.controller.ts` | Summary/status → `system.health.read` |
| `src/modules/admin/services/system-health.service.ts` | Unscanned summary không fake Production Ready |
| `src/modules/admin/entities/admin.constants.ts` | `SYSTEM_HEALTH_READ` |

### RBAC
| File | Lý do |
|------|-------|
| `scripts/create-admin-local.ts` | Permission + ADMIN matrix |
| `scripts/deploy/sync-rbac-production.mjs` | Permission + ADMIN matrix (sync khi deploy sau này) |
| `prisma/seed.mjs` | Permission + ADMIN matrix |

### Tests
| File | Lý do |
|------|-------|
| `src/modules/admin/entities/dashboard-period.spec.ts` | Period / TZ / boundary |
| `src/modules/admin/entities/dashboard-retail-scope.spec.ts` | Retail scope |
| `src/modules/admin/repositories/admin-dashboard.repository.spec.ts` | KPI where + formula + scope |
| `src/modules/admin/services/system-health-summary.spec.ts` | Unscanned health |
| `src/modules/admin/admin.service.spec.ts` | Forward period |
| `src/modules/admin/admin.security-audit.spec.ts` | Health permissions |
| `src/modules/finance/commercial-admin-test-exclusion.spec.ts` | Cập nhật assert dashboard scope C1 |

### Báo cáo
| File | Lý do |
|------|-------|
| `docs/admin/operations-dashboard-phase-c1.md` | Tài liệu nghiệm thu C1 (file này) |

---

## 3. API request / response thực tế

### Request

```
GET /admin/dashboard
GET /admin/dashboard?period=today
GET /admin/dashboard?period=last7
GET /admin/dashboard?period=month
```

- Auth: JWT + `Roles(ADMIN|SUPER_ADMIN)` + `Permissions(admin.dashboard)`
- `period` thiếu / không hợp lệ → **`today`** (normalize trong service, không ValidationPipe 400)

### Response shape (C1)

```ts
{
  period: {
    preset: 'today' | 'last7' | 'month',
    dateFrom: string,      // YYYY-MM-DD VN inclusive
    dateTo: string,        // YYYY-MM-DD VN inclusive
    timezone: 'Asia/Ho_Chi_Minh',
  },
  asOf: string,            // ISO now
  currency: 'VND',
  business: {
    revenue: string,       // Σ sellAmount
    profit: string,        // sell − providerCost − paymentFeeAmount
    providerCost: string,
    gatewayFee: string,    // Σ paymentFeeAmount
    paidOrderCount: number,
    createdOrderCount: number,
  },
  payments: {
    successAttemptCount: number, // B5
    failedAttemptCount: number,  // D1
  },
  backlog: {
    pendingDelivery: number,
    processing: number,
    waitingAdminRetry: number,
    needManualReview: number,
  },
  providerErrors: number,
  providerErrorsScope: 'SYSTEM',
  agentStatistics: {
    total: number,
    active: number,
    pendingKyc: number,
    suspended: number,
    rejected: number,
  },
  // Legacy (pre-C2 FE)
  todayRevenue: string,          // = business.revenue (kỳ đang chọn)
  ordersCount: number,           // = createdOrderCount
  successfulPayments: number,    // = successAttemptCount
  failedPayments: number,        // = failedAttemptCount
  pendingFulfillment: number,    // pending + processing + waitingAdminRetry (không gồm review)
}
```

### Health summary

```
GET /admin/system/health          → system.health.read
GET /admin/system/health/status   → system.health.read
GET /admin/system/health/report   → settings.manage
POST /admin/system/health/run     → settings.manage
POST /admin/system/health/autofix → settings.manage
GET /admin/system/health/export/* → settings.manage
```

Unscanned summary (trích):

```json
{
  "scanAvailable": false,
  "healthScore": null,
  "productionLabel": null,
  "status": null,
  "runAt": null,
  "categoryIntegrity": { "label": "Chưa quét" }
}
```

---

## 4. Công thức và điều kiện từng KPI

### Phạm vi retail chung (B1–B5, D1, C1–C4)

`dashboardRetailOrderWhere()` =

- `deletedAt: null`
- `EXCLUDE_ADMIN_TEST_ORDERS` (clientTrace adminTest)
- `channel: B2C`
- `NOT orderItems.some.variant.type = ESIM`

### B1 Doanh thu / B2 Lợi nhuận / B3 Đơn PAID

- Order thỏa retail + `paymentStatus = PAID`
- Có ≥1 Payment: `deletedAt null` · `status = SUCCESS` · `paidAt ∈ [from, toExclusive)`
- Doanh thu = `Σ sellAmount`
- Provider cost = `Σ providerCost`
- Gateway fee = `Σ paymentFeeAmount`
- Lợi nhuận = `sellAmount − providerCost − paymentFeeAmount`  
  → **cùng** `AdminRepository.aggregateOrdersAdmin` (Orders Summary)

### B4 Đơn tạo

- Retail + `createdAt ∈ kỳ`
- Không phụ thuộc payment status

### B5 Payment SUCCESS attempts

- Payment `SUCCESS` · `paidAt ∈ kỳ` · `ACTIVE_PAYMENT_WHERE`
- `order` = retail scope
- Đếm **payment rows** (không distinct order)

### D1 Payment FAILED attempts

- Payment **hiện tại** `FAILED` · `updatedAt ∈ kỳ`
- Cùng `order` retail scope như B5
- Row đã chuyển SUCCESS → không còn D1
- Retry = payment row mới → attempt riêng

### D2 Provider errors

- `provider_logs` · `status = FAILED` · `createdAt ∈ kỳ`
- **Không** join/filter Order (orderId nullable)
- Response: `providerErrorsScope: 'SYSTEM'`

### C1–C4 Backlog (snapshot)

| Field | Condition |
|-------|-----------|
| pendingDelivery | PAID + PENDING |
| processing | PAID + PROCESSING |
| waitingAdminRetry | PAID + WAITING_ADMIN_RETRY |
| needManualReview | PAID + NEED_MANUAL_REVIEW |

Enum nguồn: `FulfillmentStatus` Prisma — khớp tài liệu Phase B, không ánh xạ lại.

### Agent statistics

- `agent.groupBy({ by: ['status'], where: { deletedAt: null } })`
- Snapshot toàn hệ thống

---

## 5. Bằng chứng đối chiếu Orders Summary

| Hạng mục | Orders Summary (`aggregateOrdersAdmin`) | Cockpit C1 |
|----------|------------------------------------------|------------|
| Revenue field | `_sum.sellAmount` | `_sum.sellAmount` |
| Cost field | `_sum.providerCost` | `_sum.providerCost` |
| Fee field | `_sum.paymentFeeAmount` | `_sum.paymentFeeAmount` |
| Profit | `sell − cost − fee` | `sell − cost − fee` |
| Admin-test | `EXCLUDE_ADMIN_TEST_ORDERS` | cùng helper |
| Soft-delete | `ACTIVE_ORDER_WHERE` | cùng |
| Channel / eSIM | Query FE Orders B2C + `excludeProductType=ESIM` | hard-code cùng điều kiện trong `dashboardRetailOrderWhere` |

**Khác biệt có chủ đích (Phase B đã ghi nhận):**

- Cockpit lọc **paidAt** (qua Payment SUCCESS); Orders list/summary hiện lọc ngày theo **createdAt**.
- Drill-down `dateBasis=paidAt` = follow-up, **không** thuộc C1.
- Test unit: `admin-dashboard.repository.spec.ts` assert profit `50000 − 30000 − 500 = 19500`; admin-test exclusion spec assert retail scope trên aggregate + payment.count.

---

## 6. Permission / RBAC trước và sau

| Endpoint | Trước | Sau |
|----------|-------|-----|
| `GET /admin/dashboard` | `admin.dashboard` | không đổi |
| `GET /admin/system/health` | `settings.manage` | **`system.health.read`** |
| `GET /admin/system/health/status` | `settings.manage` | **`system.health.read`** |
| report / run / autofix / export | `settings.manage` | không đổi |

| Role | `system.health.read` |
|------|----------------------|
| ADMIN | **có** (cùng nhóm có `admin.dashboard`) |
| SUPER_ADMIN | **có** (full PERMISSIONS list) |
| SUPPORT / ACCOUNTANT / MARKETING | không (không có dashboard) |

**Lưu ý vận hành:** permission mới cần chạy sync RBAC trên môi trường đích sau khi owner duyệt deploy (C1 local only — chưa sync prod).

---

## 7. Kết quả test chi tiết

### Suite C1-focused

```
dashboard-period.spec.ts
dashboard-retail-scope.spec.ts
admin-dashboard.repository.spec.ts
system-health-summary.spec.ts
admin.service.spec.ts
admin.security-audit.spec.ts
```

→ **6 suites · 55 tests PASS**

### Regression `npm run test:admin`

→ **30 suites · 245 tests PASS** (0 FAIL)

### Coverage mapping (yêu cầu C1 §6)

| Nhóm | Covered by |
|------|------------|
| Business paidAt / created / profit | `admin-dashboard.repository.spec.ts` |
| Payment B5/D1 scope + admin-test/eSIM/B2C | repository where asserts + retail-scope + commercial-admin-test-exclusion |
| Provider D2 system-wide | repository assert no order join |
| Backlog PAID split + unpaid excluded | repository backlog where asserts |
| Period VN / endExclusive | `dashboard-period.spec.ts` |
| Health permission + unscanned | security-audit + system-health-summary |
| Admin regression | `test:admin` 245 PASS |

---

## 8. Hiệu năng query và index

### Query pattern C1

`Promise.all` gồm:

1. `order.aggregate` (B1/B2)
2. `order.count` × 2 (B3, B4)
3. `payment.count` × 2 (B5, D1)
4. `order.count` × 4 (backlog)
5. `providerLog.count` (D2)
6. `agent.groupBy` (E)

Không `findMany` toàn bộ orders để reduce.

### Index hiện có (schema, không migration C1)

| Table | Index liên quan | Ghi chú |
|-------|-----------------|--------|
| `orders` | `deletedAt`, … | Chưa có composite `(channel, paymentStatus, createdAt)` / fulfillment |
| `payments` | `orderId`, `deletedAt`, … | **Không** index `paidAt` / `updatedAt` / `status` |
| `provider_logs` | `providerId`, `orderId`, `requestId` | **Không** index `(status, createdAt)` |

### Đề xuất (không làm trong C1)

Nếu EXPLAIN trên volume thật chậm:

1. `payments (status, paidAt)` — B5  
2. `payments (status, updatedAt)` — D1  
3. `provider_logs (status, createdAt)` — D2  
4. Optional orders composite cho backlog PAID + fulfillment  

Cần EXPLAIN evidence riêng trước khi mở PR migration.

---

## 9. Điểm chưa hoàn thành / rủi ro còn lại

| # | Mục | Ghi chú |
|---|-----|--------|
| 1 | **C2 Frontend** | Cockpit UI, soft-fail health, hint B5/D1/D2, bỏ `?? 100` trên healthScore |
| 2 | **C3 Integration & QA** | E2E + drill-down tooltip paidAt vs createdAt |
| 3 | RBAC sync trên DB thật | Local scripts đã cập nhật; chưa chạy sync prod |
| 4 | `dateBasis=paidAt` Orders | Follow-up Phase B — không chặn Wave 1 |
| 5 | Index | Đề xuất §8 — chưa có EXPLAIN prod |
| 6 | `getReport` empty stub | Vẫn trả healthScore 100 khi chưa scan (endpoint `settings.manage`, không dùng cockpit summary). Có thể chỉnh sau nếu muốn đồng bộ |
| 7 | Legacy `pendingFulfillment` | Không gồm `needManualReview` — đúng Phase B; FE cũ cần biết khi C2 |

---

## 10. Xác nhận phạm vi tuyệt đối

| Ràng buộc | Xác nhận |
|-----------|----------|
| Chỉ C1 backend | ✅ |
| LOCAL ONLY | ✅ |
| Không FE C2 / C3 | ✅ |
| Không Prisma schema / migration | ✅ |
| Không đổi payment provider / webhook / state machine / fulfillment worker | ✅ |
| Không sửa dữ liệu production | ✅ |
| Không deploy / staging / production | ✅ |
| Không commit / push / PR | ✅ |
| Không tự mở rộng quyết định nghiệp vụ đã nghiệm thu | ✅ |

---

**Kết luận C1:** Backend Operations Cockpit sẵn sàng nghiệm thu. Dừng tại đây chờ owner duyệt trước khi bắt đầu **Phase C2 – Frontend**.
