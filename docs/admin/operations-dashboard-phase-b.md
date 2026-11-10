# Cardon Admin — Operations Dashboard · Phase B (Design)

**Ngày:** 2026-11-09  
**Trạng thái:** Phase A accepted · Phase B design — **chưa code**  
**Tham chiếu:** `docs/admin/operations-dashboard-phase-a.md` + owner chốt 5 quyết định nghiệp vụ.

---

## 0. Phạm vi & nguyên tắc

| Được làm (Phase C sau duyệt) | Không làm |
|------------------------------|-----------|
| Nâng `/dashboard` → Operations Cockpit | Không dựng Finance Hub / Operations Hub thứ hai |
| Mở rộng `GET /admin/dashboard` + health read-only | Không đổi payment / webhook / fulfillment nghiệp vụ |
| Soft-fail section, drill-down route thật | Không KPI giả / route giả |
| Permission `system.health.read` (seed RBAC) | Không nới `settings.manage` chỉ để xem |
| | **Phase B này:** không sửa source · không migration · không commit · không deploy |

**Đối chiếu Orders Summary (implementation thật):**

```ts
// AdminRepository.aggregateOrdersAdmin
paidWhere = { ...where, paymentStatus: PAID }
totalRevenue = Σ sellAmount
providerCost  = Σ providerCost
gatewayFee    = Σ paymentFeeAmount
profit        = sellAmount − providerCost − paymentFeeAmount
+ EXCLUDE_ADMIN_TEST_ORDERS
```

→ Cockpit **bắt buộc** dùng cùng field/công thức này cho doanh thu & lợi nhuận kỳ.

**Phát hiện schema quan trọng:** model `Order` **không** có cột `paidAt`. `paidAt` nằm trên **`Payment`**. Doanh thu theo `paidAt` = Order `PAID` có ≥1 payment `SUCCESS` với `paidAt` trong kỳ (Asia/Ho_Chi_Minh). **Không cần migration cột Order** nếu dùng relation filter.

---

## 1. Wireframe desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tổng quan · Operations Cockpit                                           │
│ [Hôm nay] [7 ngày] [Tháng này]     Làm mới    Cập nhật: {asOf VN}       │
├──────────────────────────────────────────────────────────────────────────┤
│ A · Tình trạng hệ thống                                    [soft-fail]   │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Health: {score% | —} · {label | «Chưa quét»}                         │ │
│ │ API ✓/⚠ · WEB · ADMIN · WORKER · Last scan: {ts|—}                   │ │
│ │ → Báo cáo Health (/configuration/health)*  → Giám sát (/monitoring)  │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ *Link Health full chỉ hiện nếu user có settings.manage; không thì ẩn.    │
├──────────────────────────────────────────────────────────────────────────┤
│ B · Kinh doanh kỳ (VND · B2C retail · theo paidAt)         [period]     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Doanh thu│ │ Lợi nhuận│ │ Đơn PAID │ │ Đơn tạo  │ │ TT SUCC  │       │
│ │ sellAmt  │ │ DT−vốn−phí│ │ (order)  │ │ (tạo kỳ) │ │ attempts │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│ Ghi chú nhỏ: «TT thành công = số lần payment SUCCESS, không phải số đơn»│
├──────────────────────────────────────────────────────────────────────────┤
│ C · Vận hành đơn (snapshot hiện tại · chỉ PAID)            [snapshot]   │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│ │ Chờ giao │ │ Đang xử  │ │ Chờ admin│ │ Cần review│                   │
│ │ PENDING  │ │ PROCESSING│ │ RETRY    │ │ MANUAL   │                   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                    │
│ → eSIM Ops (lane riêng, không trộn số VND)                               │
├──────────────────────────────────────────────────────────────────────────┤
│ D · Thanh toán & NCC                                       [mixed]      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                                  │
│ │ TT FAIL  │ │ Lỗi NCC  │ │ → Operations / Payments / Providers         │
│ │ attempts │ │ logs kỳ  │ │                                             │
│ │ B2C retail│ │ toàn HT  │ │  (D2 ≠ cùng scope B5/D1 — xem §4.3)       │
│ └──────────┘ └──────────┘ └──────────┘                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ E · Đại lý (snapshot)                                      [snapshot]   │
│ Tổng · Active · Chờ KYC · Suspended · Rejected → /agents/overview        │
├──────────────────────────────────────────────────────────────────────────┤
│ F · Sự kiện gần đây (optional · activity.read)             [optional]   │
│ 5–10 dòng ERROR/WARNING mới nhất · → /monitoring/activity                │
└──────────────────────────────────────────────────────────────────────────┘
```

**Không** nhúng bảng VAT / scanner integrity / autofix.

---

## 2. Wireframe mobile

```
┌─────────────────────┐
│ Tổng quan           │
│ [Hôm nay ▾]  Refresh│
├─────────────────────┤
│ A Health (2–3 dòng) │
│ Score · Label       │
│ Services · Links    │
├─────────────────────┤
│ B KPI 2×2 / stack   │
│ DT | LN             │
│ PAID | Tạo          │
│ + TT SUCC (hint)    │
├─────────────────────┤
│ C Backlog 2×2       │
├─────────────────────┤
│ D Pay / NCC         │
├─────────────────────┤
│ E Agents row scroll │
├─────────────────────┤
│ F Activity (nếu có) │
└─────────────────────┘
```

- Period = select/chips full-width.  
- Không hiện version matrix dài trên mobile (đưa vào link Health).  
- Section độc lập: skeleton 1 khối khi loading.

---

## 3. Component tree

```
app/dashboard/page.tsx
└── DashboardCockpitPage
    ├── DashboardHeader
    │     ├── PeriodChips (today | last7 | month)
    │     └── RefreshButton + asOf
    ├── DashboardHealthSection          // soft-fail
    │     └── HealthStrip + links
    ├── DashboardBusinessSection        // period-bound
    │     └── StatCard grid (revenue, profit, paidOrders, createdOrders, paymentSuccess)
    ├── DashboardOrderOpsSection        // snapshot
    │     └── StatCard grid (pending, processing, waitingRetry, needReview) + EsimLink
    ├── DashboardPayProviderSection     // period payment fail + provider errors
    ├── DashboardAgentSection           // snapshot
    └── DashboardActivitySection?       // only if activity.read
```

**Tái dùng:** `StatCard`, `Card`, `Badge`, `ErrorMessage`, `RequirePermission` (`admin.dashboard`), pattern section loading như Orders / Agent overview / Monitoring.

**Thư mục mới (Phase C):** `apps/admin/components/dashboard/*`.

---

## 4. Định nghĩa KPI chính xác

### 4.1 Kỳ thời gian (Asia/Ho_Chi_Minh)

| Preset | `dateFrom` / `dateTo` (calendar VN) | Bounds |
|--------|--------------------------------------|--------|
| Hôm nay | `vietnamCalendarDate()` → cùng ngày | `vietnamDayBounds` start → endExclusive |
| 7 ngày | từ (hôm nay − 6) → hôm nay | inclusive 7 calendar days |
| Tháng này | ngày 1 tháng hiện tại → hôm nay | `vietnamDayBounds` |

Utility: `vietnamCalendarDate` / `vietnamDayBounds` (`src/common/utils/vietnam-time.util.ts`) — cùng Orders/Finance.

### 4.2 Scope chung kinh doanh

Áp dụng cho KPI **order-centric** (B1–B4, C1–C4) và **payment attempts B5/D1** (qua quan hệ `Payment.order`):

- Channel mặc định **B2C** (khớp Orders list default; không trộn agent API).  
- `ACTIVE_ORDER_WHERE` + `EXCLUDE_ADMIN_TEST_ORDERS` (cùng Orders Summary).  
- eSIM: Orders B2C list đang `excludeProductType=ESIM` — **Wave 1 cockpit retail VND:** cùng exclude ESIM khỏi B1–B5, D1, C1–C4 (eSIM có `/esim-ops`).  
- Ghi chú UI (section B/C): «Không gồm eSIM / đại lý».

**Ngoại lệ phạm vi:** KPI **D2** (provider errors) = **toàn hệ thống** — xem §4.3.3. Không giả định cùng scope B2C/eSIM.

#### Quan hệ dữ liệu đã xác minh (schema)

| Quan hệ | Thực tế Prisma |
|---------|----------------|
| `Payment` → `Order` | **Bắt buộc** `Payment.orderId` → `Order` (`onDelete: Restrict`). Mọi payment gắn đúng một order. |
| Admin-test trên payment | Không có cột riêng trên `payments`. `EXCLUDE_ADMIN_TEST_PAYMENTS` = `{ order: EXCLUDE_ADMIN_TEST_ORDERS }` (lọc qua `Order.clientTrace.adminTest`). |
| eSIM trên payment | `Payment.productLane` nullable; lane eSIM ghi `'ESIM'`. Retail thường `null`. Có thể loại eSIM qua `order.orderItems.variant.type` (cùng Orders) và/hoặc `productLane ≠ 'ESIM'`. Phase C ưu tiên **cùng điều kiện order** như B1–B4 để đồng bộ. |
| Channel | Chỉ trên `Order.channel` — payment không có channel riêng; B5/D1 lọc `order.channel = B2C`. |
| `ProviderLog` → `Order` | `ProviderLog.orderId` **nullable** (`Order?`). Có index `orderId` nhưng nhiều / một số log có thể không gắn order. |

### 4.3 KPI theo kỳ (period)

| ID | Label UI | Phạm vi dữ liệu | Định nghĩa ngắn | Aggregate |
|----|----------|-----------------|-----------------|-----------|
| B1 | Doanh thu | B2C · not eSIM · exclude admin-test | Order PAID + payment SUCCESS `paidAt ∈ kỳ` | `Σ orders.sellAmount` |
| B2 | Lợi nhuận | = B1 | Cùng tập Order B1 | `Σ sellAmount − Σ providerCost − Σ paymentFeeAmount` |
| B3 | Đơn PAID | = B1 | Distinct Order thỏa B1 | `count` **đơn** |
| B4 | Đơn tạo | B2C · not eSIM · exclude admin-test | Order `createdAt ∈ kỳ` (mọi paymentStatus) | `count` **đơn** |
| B5 | TT thành công (attempts) | **B2C · not eSIM · exclude admin-test** (qua Order) | Payment `SUCCESS` · `paidAt ∈ kỳ` | `count` **lần TT** |
| D1 | TT thất bại (attempts) | **Cùng phạm vi B5** | Payment `FAILED` · `updatedAt ∈ kỳ` | `count` **lần TT** |
| D2 | Lỗi provider | **Toàn hệ thống** (không lọc B2C/eSIM/admin-test Wave 1) | `provider_logs` `FAILED` · `createdAt ∈ kỳ` | `count` **log** |

**Nhãn bắt buộc B5/D1:** «lần thanh toán» / «payment attempts» — **không** ghi «đơn».  
**Nhãn D2:** «Lỗi provider (toàn hệ thống)» hoặc hint tương đương.

#### 4.3.1 B5 — Payment SUCCESS attempts

**Đếm:** số dòng `payments` (mỗi lần tạo / attempt thanh toán), **không** distinct `orderId`.

**Điều kiện query (Wave 1):**

```text
payments WHERE
  deletedAt IS NULL                    -- ACTIVE_PAYMENT_WHERE
  AND status = SUCCESS
  AND paidAt >= from AND paidAt < toExclusive   -- kỳ VN
  AND order matches:
        deletedAt IS NULL
        AND channel = B2C
        AND EXCLUDE_ADMIN_TEST_ORDERS
        AND NOT (exists orderItem.variant.type = ESIM)
```

Tương đương Prisma: `where: { ...ACTIVE_PAYMENT_WHERE, status: SUCCESS, paidAt: { gte, lt }, order: { channel: B2C, ...EXCLUDE_ADMIN_TEST_ORDERS, NOT: { orderItems: { some: { variant: { type: ESIM } } } } } } }` rồi `count`.

**Không:** `count(DISTINCT orderId)`, không cộng B5 vào «số đơn PAID» (B3).

#### 4.3.2 D1 — Payment FAILED attempts

**Phạm vi:** **cùng B5** (B2C · not eSIM · `EXCLUDE_ADMIN_TEST_PAYMENTS` qua order) — quan hệ `Payment.order` bắt buộc nên áp dụng được.

**Điều kiện query (Wave 1):**

```text
payments WHERE
  deletedAt IS NULL
  AND status = FAILED          -- trạng thái hiện tại của dòng payment
  AND updatedAt >= from AND updatedAt < toExclusive
  AND order matches: (cùng B5 — B2C, exclude admin-test, not ESIM)
```

**`updatedAt` làm mốc kỳ:** lấy thời điểm cập nhật gần nhất của bản ghi đang ở `FAILED`. Khớp cách dashboard hiện tại dùng `updatedAt` cho fail count.

**Đổi trạng thái nhiều lần (hành vi schema hiện tại):**

- Mỗi payment attempt là **một row** với một `status` hiện tại (`PENDING` → `SUCCESS` | `FAILED` | `EXPIRED`, …).  
- Retry thường tạo **row payment mới** (idempotency / reference mới), không giữ lịch sử trạng thái trên cùng row.  
- D1 chỉ đếm row **đang** `FAILED` có `updatedAt` trong kỳ.  
- Nếu một row từng fail rồi được cập nhật thành `SUCCESS`, nó **không** còn trong D1 (không còn `status=FAILED`).  
- Wave 1 **không** reconstruct lịch sử fail từ audit/webhook — chỉ snapshot trạng thái hiện tại + `updatedAt`.

#### 4.3.3 D2 — Provider errors

**Schema:** `ProviderLog` có `orderId String?` → `Order?` (optional). Không có channel / adminTest / productLane trên log.

**Khả năng lọc B2C / eSIM / admin-test:**

- Chỉ áp dụng được cho subset `orderId IS NOT NULL` bằng join `order`.  
- Log `orderId IS NULL` **không** gắn được scope retail.  
- Lọc «chỉ log có order B2C» sẽ **bỏ sót** lỗi không gắn order → sai nếu trình bày như «lỗi NCC bán lẻ».

**Quyết định Wave 1 (không suy diễn quan hệ mới):**

- D2 = **`count(provider_logs)`** với `status = FAILED` ∧ `createdAt ∈ kỳ`.  
- **Không** lọc B2C, eSIM, admin-test.  
- UI: phạm vi **toàn hệ thống** (mọi channel / có hoặc không order).  
- eSIM ops / agent lỗi NCC (nếu ghi log) **nằm trong** D2.

Follow-up (không bắt buộc Wave 1): tách «log có order B2C» vs «log không order» nếu owner cần — phải label rõ, không trộn một số.

### 4.4 KPI snapshot (không theo period filter)

| ID | Label | Định nghĩa |
|----|-------|------------|
| C1 | Chờ giao | PAID ∧ fulfillment=`PENDING` ∧ exclude admin-test ∧ B2C ∧ not ESIM |
| C2 | Đang xử lý | PAID ∧ `PROCESSING` ∧ … |
| C3 | Chờ admin retry | PAID ∧ `WAITING_ADMIN_RETRY` ∧ … |
| C4 | Cần review | PAID ∧ `NEED_MANUAL_REVIEW` ∧ … **tách riêng** |
| E* | Agent stats | `agent.groupBy(status)` như hiện tại (toàn hệ thống) |

Backlog **không** gồm WAITING_PAYMENT / unpaid.

### 4.5 Health strip

| Field | Rule |
|-------|------|
| `scanAvailable` | `lastScanAt != null` từ summary |
| Score / label | Chỉ hiện khi `scanAvailable`; ngược lại score `—`, label **«Chưa quét»** — **cấm** default 100 / Production Ready |
| Services | version status API/WEB/ADMIN/WORKER nếu có |
| Links | Monitoring: nếu có quyền monitoring; Full Health report: chỉ `settings.manage` |

---

## 5. API mapping & permission

### 5.1 API

| Section | Method | Ghi chú Phase C |
|---------|--------|-----------------|
| Business + backlog + agents + pay/provider period | **Mở rộng** `GET /admin/dashboard?period=today\|last7\|month` | Một response cockpit; parallel `aggregate`/`count` only |
| Health | `GET /admin/system/health` (summary hiện có) | Đổi permission summary → `system.health.read`; **giữ** scan/report/autofix/export = `settings.manage` |
| Activity optional | `GET /admin/activity?severity=…&take=10` | Chỉ gọi nếu `activity.read` |
| Không gọi | Finance VAT, operations dashboard full, health run/autofix | — |

**Response đề xuất (mở rộng, backward-compatible fields cũ có thể deprecate dần):**

```ts
{
  period: { preset, dateFrom, dateTo, timezone: 'Asia/Ho_Chi_Minh' },
  asOf: string,
  currency: 'VND',
  business: {
    revenue: string,          // Σ sellAmount
    profit: string,           // sell − cost − fee
    providerCost: string,
    gatewayFee: string,
    paidOrderCount: number,   // B3
    createdOrderCount: number,// B4
  },
  payments: {
    /** B5: payment SUCCESS rows; scope B2C + not eSIM + exclude admin-test via order */
    successAttemptCount: number,
    /** D1: payment FAILED rows; same scope as B5; period by updatedAt */
    failedAttemptCount: number,
  },
  backlog: {
    pendingDelivery: number,     // C1
    processing: number,          // C2
    waitingAdminRetry: number,   // C3
    needManualReview: number,    // C4
  },
  /** D2: provider_logs FAILED in period — system-wide (no B2C/eSIM/admin-test filter) */
  providerErrors: number,
  providerErrorsScope: 'SYSTEM', // explicit for FE copy
  agentStatistics: { ... },      // E
}
```

**Phase C query mapping (B5 / D1 / D2):**

| KPI | Table | Period field | Scope filter |
|-----|-------|--------------|--------------|
| B5 | `payments` | `paidAt` | `order`: B2C + `EXCLUDE_ADMIN_TEST_ORDERS` + not ESIM variant |
| D1 | `payments` | `updatedAt` | **Cùng** `order` scope B5 |
| D2 | `provider_logs` | `createdAt` | **Không** join/filter Order Wave 1 |

### 5.2 Permission

| Action | Permission |
|--------|------------|
| Xem cockpit | `admin.dashboard` (+ role ADMIN/SUPER_ADMIN như hiện tại trừ khi owner nới sau) |
| Health summary read | **`system.health.read`** (mới) — gán cho role có `admin.dashboard` |
| Health scan / report / autofix / export | `settings.manage` (không đổi) |
| Activity strip | `activity.read` |
| Drill-down Orders | `orders.read` (link ẩn nếu thiếu) |
| Agents overview | quyền Agent Center hiện có |

**Seed RBAC Phase C:** thêm permission code trong `scripts/deploy/sync-rbac-production.mjs` + local create-admin scripts; gán ADMIN/SUPER_ADMIN (và role nào đang có dashboard). **Không** dùng migration Prisma cho RBAC seed (script sync).

### 5.3 Query doanh thu theo `paidAt` (không migration Order)

```text
orders WHERE
  deletedAt IS NULL
  AND channel = B2C
  AND paymentStatus = PAID
  AND NOT adminTest (EXCLUDE_ADMIN_TEST_ORDERS)
  AND NOT (orderItems.variant.type = ESIM)   -- cùng excludeProductType Orders B2C
  AND EXISTS payment:
        deletedAt IS NULL
        AND status = SUCCESS
        AND paidAt >= from AND paidAt < toExclusive
AGGREGATE: sum(sellAmount), sum(providerCost), sum(paymentFeeAmount), count
```

Tương đương Prisma: `payments: { some: { ... } }` + `_sum` / `_count`.

---

## 6. Drill-down routes (chỉ filter đang hỗ trợ)

Orders list hiện filter ngày theo **`createdAt`** (`buildAdminOrderWhere`). Drill-down kỳ **paidAt** chưa khớp 1:1.

| KPI | Wave 1 link (route/filter thật) | Ghi chú |
|-----|----------------------------------|---------|
| Doanh thu / LN / Đơn PAID | `/orders?paymentFilter=PAID&dateFrom&dateTo` (+ channel B2C, exclude ESIM mặc định) | Ngày = **createdAt** — UI tooltip: «Danh sách lọc theo ngày tạo; số cockpit theo ngày thanh toán (paidAt).» |
| Đơn tạo | `/orders?dateFrom&dateTo` | Khớp createdAt |
| TT SUCCESS attempts | `/payments` nếu filter status/date hỗ trợ; không thì `/operations/exceptions` hoặc text-only | Kiểm tra Payments UI Phase C; không bịa query |
| TT FAIL attempts | tương tự `/payments` | |
| C1 Chờ giao | `/orders` Exception: `exception=pending` → `paymentFilter=PAID&fulfillmentStatus=PENDING` (không date — snapshot) | Khớp OrdersListPageClient |
| C2 Processing | `exception=processing` | |
| C3 Waiting retry | `exception=attention&attentionSub=WAITING_ADMIN_RETRY` | |
| C4 Need review | `exception=attention&attentionSub=NEED_MANUAL_REVIEW` | |
| Provider errors | `/providers` hoặc `/monitoring` / `/finance/providers` theo quyền | |
| Agents | `/agents/overview` | |
| Health full | `/configuration/health` | chỉ settings.manage |
| Activity | `/monitoring/activity` | |
| eSIM | `/esim-ops` | |

**Phase C follow-up (khuyến nghị, không bắt buộc Wave 1):** thêm `dateBasis=paidAt|createdAt` vào `AdminOrderQueryDto` để drill-down DT khớp cockpit — đây là mở rộng API thật, không phải route giả.

---

## 7. Loading / error / empty states

| Section | Loading | Error | Empty |
|---------|---------|-------|-------|
| Page shell | `RequirePermission` + header hiện ngay | — | — |
| A Health | skeleton strip | Banner «Không tải được health» — **các section khác vẫn chạy** | «Chưa quét» nếu 200 nhưng chưa scan |
| B Business | 5 skeleton cards | Error trong section + Retry | Zeros hợp lệ (0đ / 0 đơn) |
| C Backlog | skeleton | section error | 0 = «Không có đơn tồn» |
| D Pay/NCC | skeleton | section error | 0 |
| E Agents | skeleton | section error | 0 |
| F Activity | skeleton hoặc ẩn | ẩn section nếu 403 | «Không có sự kiện» |

**Cấm** `Promise.all` cứng giữa health và dashboard metrics.

Refresh: nút tay; optional auto ≥60s sau Wave 1.1 — không bắt buộc Wave 1.

---

## 8. File dự kiến sửa (Phase C)

### Frontend
- `apps/admin/app/dashboard/page.tsx` — thay layout cockpit  
- `apps/admin/components/dashboard/*` — sections mới  
- `apps/admin/types/api.ts` — `DashboardStats` mở rộng  
- `apps/admin/services/api-client.ts` — query `period`  
- `apps/admin/lib/i18n/vi.ts` — copy KPI / hints / «Chưa quét»  
- `apps/admin/lib/permissions.ts` — nếu cần map `system.health.read` (không dùng cho nav bắt buộc)

### Backend
- `src/modules/admin/repositories/admin.repository.ts` — `getDashboardStats(period)` aggregates  
- `src/modules/admin/services/admin-dashboard.service.ts`  
- `src/modules/admin/controllers/admin.controller.ts` — query DTO period  
- `src/modules/admin/dto/admin.dto.ts` — `DashboardQueryDto`  
- `src/modules/admin/controllers/system-health.controller.ts` — tách permission GET summary  
- `src/modules/admin/entities/admin.constants.ts` — permission constant  
- Specs: `admin.service.spec.ts`, commercial-admin-test exclusion, health permission audit  
- RBAC seed: `scripts/deploy/sync-rbac-production.mjs`, `scripts/create-admin-local.ts`, …

### Không đụng
- Payment providers / webhook / fulfillment workers  
- Finance VAT services  
- Operations exception engine (chỉ link)  
- Prisma schema (Wave 1)

### Optional performance (owner quyết sau)
- Index `payments(paid_at)` nếu EXPLAIN chậm — **migration riêng**, không gộp Wave 1 bắt buộc.

---

## 9. Performance considerations

1. Chỉ `count` / `aggregate` / `groupBy` — **cấm** `findMany` all orders rồi reduce.  
2. Parallel `Promise.all` trong repository cho các count độc lập.  
3. Period max = tháng hiện tại (~30 ngày) — đủ nhẹ với index `payment_status`, `created_at`, `payments.paid_at` (nếu có).  
4. Backlog/agents: count snapshot, không phụ thuộc period.  
5. Health summary: giữ nhẹ (version + last report in-memory); không trigger scan khi mở dashboard.  
6. Activity: `take=10`, không stats nặng.  
7. FE: abort/ignore stale response khi đổi period nhanh.

---

## 10. Test plan & acceptance criteria

### 10.1 Unit / API
- [ ] Revenue/profit kỳ = cùng số với gọi `orders/summary` trên **cùng tập PAID** khi dateBasis=paidAt (sau khi có helper test hoặc so khớp SQL).  
- [ ] Order PAID nhưng `payment.paidAt` ngoài kỳ → **không** vào B1/B2/B3.  
- [ ] Order tạo trong kỳ chưa PAID → chỉ B4, không B1.  
- [ ] `adminTest: true` excluded khỏi business + backlog + **B5 và D1**.  
- [ ] B5: chỉ `count` payment rows SUCCESS; 2 SUCCESS cùng một order → B5=+2, B3 vẫn +1 nếu order thỏa.  
- [ ] B5/D1: payment thuộc order AGENT hoặc eSIM variant → **không** đếm.  
- [ ] D1: parity scope với B5; admin-test order → payment FAILED không đếm.  
- [ ] D1: row `status=FAILED` với `updatedAt` ngoài kỳ → không đếm; row đã chuyển khỏi FAILED → không đếm.  
- [ ] D2: đếm mọi `provider_logs` FAILED trong kỳ **kể cả** orderId null / agent / eSIM / admin-test (system-wide).  
- [ ] D2: **không** yêu cầu join Order để ra số Wave 1.  
- [ ] Backlog C1–C4 chỉ PAID; unpaid PENDING không đếm.  
- [ ] NEED_MANUAL_REVIEW không gộp vào C1–C3.  
- [ ] Period today/last7/month bounds VN đúng (DST không áp dụng VN).  
- [ ] `system.health.read` đọc summary; không gọi được run/autofix.  
- [ ] Chưa scan → UI «Chưa quét», không 100%.

### 10.2 FE
- [ ] Health 403/500 không làm mất section B–E.  
- [ ] Đổi period chỉ reload B + D (period-bound); C/E không đổi trừ Refresh full.  
- [ ] Mỗi section có loading/error riêng.  
- [ ] Hint B5/D1: «lần thanh toán» (attempts), không «đơn».  
- [ ] Hint D2: phạm vi «toàn hệ thống».  
- [ ] Drill-down exception backlog mở đúng filter Orders.  
- [ ] Mobile: period + stack readable, không horizontal overflow KPI.  
- [ ] Không có bảng VAT / nút Run scan trên dashboard.

### 10.3 Acceptance Criteria (ship Wave 1)

1. `/dashboard` là Operations Cockpit theo wireframe §1–2.  
2. DT/LN theo `paidAt` + `sellAmount` − cost − fee, exclude admin-test, TZ VN.  
3. Backlog chỉ PAID; NEED_MANUAL_REVIEW tách KPI.  
4. Period Hôm nay / 7 ngày / Tháng này.  
5. Health read-only permission riêng; chưa quét không fake Ready.  
6. Section độc lập; soft-fail health.  
7. Drill-down chỉ route/filter thật; lệch createdAt vs paidAt có tooltip.  
8. Không migration schema Order; không đụng payment/fulfillment core.  
9. Không Finance/Operations hub thứ hai.

---

## 11. Effort Phase C (ước lượng)

| Hạng | Effort |
|------|--------|
| BE dashboard aggregates + DTO period + tests | 1–1.5 ngày |
| Health permission tách + RBAC seed | 0.5 ngày |
| FE cockpit sections + i18n + soft-fail | 1–1.5 ngày |
| Drill-down wiring + tooltip paidAt | 0.5 ngày |
| Optional activity strip | 0.25–0.5 ngày |
| **Tổng Wave 1** | **~3.5–4.5 ngày** |

Follow-up (không chặn Wave 1): `dateBasis=paidAt` trên Orders list/summary.

---

## 12. Rủi ro còn lại

| Rủi ro | Mitigation |
|--------|------------|
| DT cockpit ≠ list Orders cùng date (createdAt vs paidAt) | Tooltip + follow-up dateBasis |
| Order PAID thiếu payment SUCCESS/paidAt null | Không vào B1; monitoring data quality riêng |
| Thiếu index `paid_at` | EXPLAIN trên staging; optional migration sau |
| Role có dashboard nhưng chưa seed `system.health.read` | Sync RBAC trong checklist deploy |
| Nhầm đếm payment = order | Copy UI bắt buộc «attempts» |
| Hiểu D2 như lỗi chỉ B2C retail | Label «toàn hệ thống»; không filter order Wave 1 |
| D1 nhầm lịch sử fail trên một row | Chỉ đếm status hiện tại FAILED + updatedAt |

---

## 13. Kết luận Phase B

Thiết kế sẵn sàng cho Phase C theo đúng 5 quyết định owner: **paidAt + sellAmount/profit Orders Summary**, **LN trên cockpit**, **backlog PAID + review tách**, **health read-only + «Chưa quét»**, **period 3 mức / snapshot backlog-agent**.

**Phạm vi B5/D1/D2 đã chốt trong tài liệu:** B5 & D1 = attempts B2C retail (qua `Payment.order`, exclude admin-test + eSIM); D2 = lỗi `provider_logs` **toàn hệ thống** (`orderId` nullable — không ép filter B2C Wave 1).

**Dừng tại đây — chờ owner nghiệm thu Phase B trước khi Phase C (implementation).**
