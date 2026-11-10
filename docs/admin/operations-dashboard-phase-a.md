# Cardon Admin — Operations Dashboard Upgrade · Phase A (Audit)

**Ngày:** 2026-11-09  
**Phạm vi:** Read-only audit + đề xuất. **Không** sửa code · migration · commit · deploy.  
**Nguồn brief:** GPT «CARDON ADMIN – OPERATIONS DASHBOARD UPGRADE» — đã lọc/áp cho kiến trúc Cardon hiện có.

---

## 0. Đánh giá brief GPT → áp dụng Cardon

| Ý GPT | Đánh giá Cardon | Quyết định Phase B |
|-------|-----------------|-------------------|
| Nâng `/admin` thành Operations Center | Root `/` chỉ redirect theo role; trang Tổng quan thật là **`/dashboard`**. Module **`/operations`** đã là Operations Hub (đối soát / exception / manual / invoices). | Nâng **`/dashboard`** thành *Operations Cockpit* (tóm tắt + drill-down). **Không** thay thế `/operations` hay Finance Hub. |
| System Health trên dashboard | Đã có card health + báo cáo đầy đủ tại `/configuration/health`, Monitoring `/monitoring/*`, Server health riêng. | Giữ card tóm tắt + link; **không** nhúng full integrity scanner vào dashboard. |
| Business / Finance KPI sâu | Finance Hub (`/finance/*`) + Orders summary đã có doanh thu/giá vốn/phí/LN đúng công thức. Dashboard hiện chỉ có doanh thu thô. | Dashboard: KPI vận hành ngày + link Finance/Orders. **Không** xây lại Finance Dashboard. |
| Không KPI giả / không đổi payment | Khớp rule Cardon. | Chỉ surface số có API/DB rõ. |
| Time filter kỳ | Dashboard hiện **hard-code hôm nay** (VN calendar). Orders/Finance đã có date filter. | Phase B: filter `Hôm nay / 7 ngày / Tháng` **chỉ** nếu tái dùng aggregate sẵn hoặc mở rộng API nhẹ — không full-scan. |

**Kết luận định hướng:** Brief GPT đúng hướng UX, nhưng Cardon **đã tách** Operations / Finance / Monitoring. Upgrade Tổng quan = **cockpit điều hành**, không phải hub thứ hai trùng chức năng.

---

## 1. Hiện trạng Frontend (A1)

### 1.1 Route & entry

| Route | Vai trò |
|-------|---------|
| `/` (`app/page.tsx`) | Redirect `defaultRouteForRole` → thường `/dashboard` nếu có `admin.dashboard`. |
| `/dashboard` (`app/dashboard/page.tsx`) | **Tổng quan** — trang cần nâng cấp. |
| Nav | `NAV_ITEMS`: `{ href: '/dashboard', permission: 'admin.dashboard' }`. |

### 1.2 UI hiện tại (`DashboardPage`)

1. Title «Tổng quan» + `asOf`.
2. **1 hàng KPI (4 ô):** System Health card (link `/configuration/health`) · Doanh thu hôm nay · Đơn hàng hôm nay · TT thành công.
3. **1 hàng KPI (3 ô):** TT thất bại · Chờ giao thẻ · Lỗi provider hôm nay.
4. **Card đại lý:** tổng / active / chờ KYC / suspended / rejected.

**Thiếu so với mục tiêu UX:** time filter, drill-down theo trạng thái đơn, backlog có ngữ cảnh PAID, payment vs provider tách rõ, recent events, empty/loading skeleton riêng (chỉ `ErrorMessage` + ẩn toàn bộ khi chưa có `stats`), mobile chỉ grid mặc định (ổn nhưng Health card dày chữ).

### 1.3 Loading / error / permission

- `Promise.all([adminApi.getDashboard(), systemHealthApi.getHealth()])` — **một API fail → cả trang lỗi**.
- Health API: permission **`settings.manage`** + Roles **ADMIN/SUPER_ADMIN** — lệch với `admin.dashboard`. Operator có dashboard nhưng không `settings.manage` sẽ không mở được Tổng quan.
- Không skeleton; không partial render (health optional).

### 1.4 Design system tham chiếu (đã có, nên tái dùng)

- Orders: `OrdersListPageClient` + `OrderSummaryCards` (LN = doanh thu − giá vốn − phí).
- Agent Center overview: StatCard grid + API riêng.
- FinanceShell / OperationsShell / MonitoringDashboard: section hub + date context.
- UI primitives: `StatCard`, `Card`, `Badge`, `ErrorMessage`, `RequirePermission`.

---

## 2. Backend / API hiện có (A2)

### 2.1 Dashboard summary

| Hạng mục | Chi tiết |
|----------|----------|
| Endpoint | `GET /admin/dashboard` |
| Controller | `AdminController.getDashboard` |
| Permission | `admin.dashboard` + Roles ADMIN/SUPER_ADMIN |
| Service | `AdminDashboardService` → `AdminRepository.getDashboardStats()` |
| Timezone | `vietnamDayBounds(vietnamCalendarDate()).start` → **«hôm nay» theo VN** |
| Response | `todayRevenue`, `ordersCount`, `successfulPayments`, `failedPayments`, `pendingFulfillment`, `providerErrors`, `agentStatistics`, `currency`, `asOf` |

### 2.2 Map từng chỉ số dashboard

| KPI UI | Nguồn DB / rule hiện tại | Ghi chú |
|--------|--------------------------|---------|
| Doanh thu hôm nay | `orders` PAID, `createdAt >= today`, sum `totalAmount`, skip `adminTest` | **Không** lọc `fulfillment COMPLETED`. `createdAt` ≠ `paidAt`. |
| Đơn hàng hôm nay | count `orders` active, `createdAt >= today` | **Gồm** WAITING_PAYMENT / FAILED / … — không phải đơn hoàn thành. |
| TT thành công | count `payments` SUCCESS, `paidAt >= today`, exclude admin-test payments | **Payment attempt**, không phải distinct order. |
| TT thất bại | count `payments` FAILED, `updatedAt >= today` | **Không** gắn `EXCLUDE_ADMIN_TEST_PAYMENTS`. |
| Chờ giao thẻ | count orders fulfillment ∈ `{PENDING, PROCESSING, WAITING_ADMIN_RETRY}` | **Backlog mọi thời điểm**, không chỉ hôm nay; **không** bắt buộc `paymentStatus=PAID`. |
| Lỗi provider hôm nay | count `provider_logs` status FAILED, `createdAt >= today` | Log NCC — khác `provider_transactions`. |
| Agent stats | `agent.groupBy(status)` | Snapshot toàn hệ thống, không theo ngày. |

### 2.3 System Health

| Hạng mục | Chi tiết |
|----------|----------|
| Endpoint dùng trên dashboard | `GET /admin/system/health` → `SystemHealthService.getSummary()` |
| Permission | `settings.manage` + ADMIN/SUPER_ADMIN |
| Nội dung summary | `healthScore`, `productionLabel`, `lastScanAt`, `systemVersion` (API/WEB/ADMIN/WORKER), maintenance, category integrity |
| Điểm yếu | Nếu **chưa từng scan**: default `healthScore=100`, label «Production Ready» — **không** chứng minh dependency healthy. Scan đầy đủ (queue, provider, storage, SMTP…) nằm ở collector + `/configuration/health`, không chạy mỗi lần mở dashboard. |
| Related | `GET /admin/monitoring/server-health`, Monitoring queues/webhooks/activity, Operations health trong PDF report |

### 2.4 API tái sử dụng tốt (không cần invent)

| Nhu cầu cockpit | API sẵn | Permission |
|-----------------|---------|------------|
| KPI đơn + LN đúng (DT − vốn − phí) | `GET /admin/orders/summary?dateFrom&dateTo&…` | `orders.read` |
| Danh sách / drill-down đơn | `GET /admin/orders?…` | `orders.read` |
| Exception / PAID stuck | `GET /admin/operations/exceptions` + hub `/operations/exceptions` | reconciliation / finance |
| Operations snapshot | `GET /admin/operations/dashboard` | operations |
| Agent overview | Agent Center `dashboard` API + `/agents/overview` | agents |
| Activity gần đây | System activity logs `/monitoring/activity` | `activity.read` |
| eSIM ops | `/admin/esim-ops/dashboard` | `orders.read` — **lane riêng**, không trộn VAT VND |
| Finance sâu | `/admin/finance/vat/*` | `finance.view` — **không** nhúng vào dashboard |

### 2.5 Chỉ số / API **không** nên đẩy vào Dashboard

- Chi tiết HĐ VAT / đối soát NCC / phí cổng layout (đã có Finance Hub).
- Full integrity findings / autofix (Configuration Health).
- Profit đa currency eSIM (lane eSIM Finance).
- KPI không có cột/aggregate (ví dụ «SLA trung bình» nếu chưa có event timestamp chuẩn).

---

## 3. Business Metric Audit (A3) — đúng / rủi ro

**Không đổi định nghĩa KPI trong Phase A.** Chỉ báo cáo để owner quyết.

| Chỉ số | Đánh giá | Rủi ro |
|--------|----------|--------|
| Revenue PAID-only | **Đúng hướng** (chỉ `PAID`) | Dùng `totalAmount` + `createdAt` ngày tạo đơn; đơn tạo hôm qua, thanh toán hôm nay **không** vào «DT hôm nay». Orders summary dùng `sellAmount` trên PAID — **lệch field** với dashboard. |
| Không tính PENDING/WAITING vào DT | **Đúng** | — |
| Order vs Payment | UI gần nhau dễ hiểu nhầm | `ordersCount` = mọi đơn tạo; `successfulPayments` = payment SUCCESS — có thể 1 đơn nhiều attempt / lệch số. |
| Không đếm trùng payment attempts như đơn | Hiện **không** distinct-order cho payment success | Cần quyết định: đếm payment hay đếm order PAID. |
| «Đơn hôm nay» vs «đơn hoàn thành hôm nay» | Label = đơn **tạo** hôm nay | Không có KPI «COMPLETED hôm nay» trên dashboard (Orders summary có `deliveredCount` theo filter). |
| Backlog chờ giao | Có số | Thiếu filter PAID; có thể gồm đơn chưa trả tiền đang PENDING. Exception Center / Orders «Đơn chờ giao» chuẩn hơn cho ops. |
| Payment fail vs fulfillment fail vs provider fail | Tách 3 ô | Đúng hướng; chưa có drill-down; `provider_logs` ≠ transaction fail rate. |
| Admin test | DT/orders/success payments đã exclude | Failed payments **chưa** exclude — nhiễu nếu có test fail. |
| Profit | Dashboard **không** hiện LN | Orders: `customerPaid − cost − fee`. Finance dashboard API cũ từng `totalAmount − cost` (thiếu phí) — **không** đưa API đó lên Tổng quan khi chưa chỉnh. |

**Đề xuất owner (không tự áp):**

1. Chuẩn hóa «Doanh thu hôm nay» = PAID theo **`paidAt`** (hoặc payment SUCCESS ngày) + field thống nhất (`sellAmount` hoặc `customerPaid`).  
2. Tách KPI: «Đơn tạo» / «Đơn PAID» / «Đơn COMPLETED».  
3. Backlog chỉ `paymentStatus=PAID` + fulfillment pending/processing/waiting_retry (+ need_manual_review nếu muốn).  
4. Dashboard profit (nếu có) = cùng công thức Orders summary.

---

## 4. System Health Audit (A4)

| Thành phần | Được kiểm tra khi nào? | Trên card Tổng quan? |
|------------|------------------------|----------------------|
| API / Web / Admin / Worker version | `SystemVersionService.collect()` mỗi `getSummary` | Có (✓/⚠) |
| PostgreSQL / Redis | Trong scan / server-health — **không** mỗi GET summary nhẹ | Không đầy đủ |
| BullMQ | Operations collector / monitoring queues | Không trên card nhỏ |
| Last scan | `lastScanAt` từ report in-memory | Có |
| Production Ready | Từ score + error count; **default 100 nếu chưa scan** | Có — **dễ lạc quan sai** |

**Nguyên tắc Phase B:** Không hiện «Healthy / Production Ready» chỉ vì HTTP 200 của summary. Nếu chưa có scan: label «Chưa quét» / score «—», CTA mở `/configuration/health`.

---

## 5. Drill-down audit (A5) — route thật

| Từ khối dashboard | Link đề xuất (đã tồn tại) | Query gợi ý |
|-------------------|---------------------------|-------------|
| Health | `/configuration/health` | — |
| Doanh thu / đơn PAID | `/orders` | date = hôm nay, `paymentStatus=PAID` (nếu filter hỗ trợ) |
| Đơn tạo hôm nay | `/orders` | date hôm nay |
| TT thất bại | `/payments` hoặc `/operations/exceptions` | theo capability filter hiện có |
| Chờ giao | `/orders` filter chờ giao **hoặc** `/operations/exceptions` | ưu tiên PAID stuck |
| Provider errors | `/providers` hoặc `/finance/providers` / monitoring | tùy quyền |
| Đại lý | `/agents/overview` | — |
| Activity | `/monitoring/activity` | severity ERROR gần đây |
| Tài chính sâu | `/finance/supplier` | không nhúng số VAT vào dashboard |
| eSIM | `/esim-ops` | lane riêng |

Không tạo route giả.

---

## 6. Performance (A6)

| Điểm | Hiện trạng |
|------|------------|
| Số API / lần mở | 2 (`dashboard` + `health`); Phase B có thể +1–2 (`orders/summary`, activity) — cần **không** `Promise.all` cứng nếu permission lệch. |
| Query dashboard | Parallel counts/findMany/groupBy — nhẹ với index `created_at` / status; `findMany` PAID hôm nay chỉ select `totalAmount, clientTrace` — OK quy mô hiện tại. |
| N+1 | Không trên dashboard path. |
| Risk | Mở rộng «7 ngày / tháng» bằng findMany + reduce JS sẽ nặng → dùng `aggregate`/`count` như `aggregateOrdersAdmin`. |
| Auto refresh | Hiện không có; nếu thêm: ≥ 60s, pause khi tab ẩn, không poll health scan nặng. |
| Cache | Chưa có cache dashboard; chưa bắt buộc Phase B. |

**Migration:** **Không cần.**

---

## 7. Phase B — Đề xuất thiết kế (chờ duyệt)

### 7.1 Bố cục desktop (wireframe chữ)

```
┌─ Tổng quan                    [Hôm nay ▾] [Làm mới]  asOf ─┐
├─ A. System status (compact) ───────────────────────────────┤
│  Score/Label (honest) · API/Web/Admin/Worker · Last scan   │
│  → Cấu hình Health · → Monitoring                          │
├─ B. Kinh doanh kỳ (VND retail) ────────────────────────────┤
│  DT PAID · Đơn PAID · Đơn tạo · LN* (từ orders/summary)    │
│  *cùng công thức Đơn hàng; link Finance nếu cần sâu        │
├─ C. Vận hành đơn ──────────────────────────────────────────┤
│  Chờ giao (PAID) · Waiting retry · Need review · eSIM CTA  │
├─ D. Thanh toán & NCC ──────────────────────────────────────┤
│  Payment OK/Fail (kỳ) · Provider fail logs · → Operations  │
├─ E. Đại lý ────────────────────────────────────────────────┤
│  Active / Pending KYC / Suspended → Agent Center           │
└─ F. Sự kiện gần đây (optional, nếu có activity.read) ──────┘
   5–10 dòng ERROR/WARNING · → Monitoring/Activity
```

### 7.2 Mobile

- 1 cột; Health gọn 2 dòng; KPI 2×2; section collapse hoặc stack; tránh nhét version matrix dài (đưa vào link Health).

### 7.3 Component tree (dự kiến)

```
app/dashboard/page.tsx
  DashboardPage
    DashboardHeader (title, period chips, refresh)
    DashboardHealthStrip   → systemHealthApi (optional / soft-fail)
    DashboardBusinessRow   → adminApi.getDashboard +/or orders/summary
    DashboardOrderOpsRow   → dashboard backlog fields (sau khi owner chốt filter)
    DashboardPayProviderRow
    DashboardAgentRow
    DashboardRecentActivity (optional)
```

Tái dùng `StatCard` / `Card` / `Badge`; pattern soft-fail từng section giống các hub khác.

### 7.4 API mapping Phase B

| Section | Tái dùng | API mới? |
|---------|----------|----------|
| Health strip | `GET /admin/system/health` | Không (có thể nới permission read-only sau — **owner quyết**) |
| Business | `GET /admin/dashboard` + `GET /admin/orders/summary` | Có thể **mở rộng nhẹ** dashboard DTO (paidOrderCount, completedCount, revenueByPaidAt) thay vì API mới |
| Order ops | dashboard `pendingFulfillment` (sau chỉnh where) | Không bắt buộc |
| Pay/NCC | dashboard payment + providerErrors | Không |
| Agents | dashboard `agentStatistics` | Không |
| Activity | existing activity list API take=10 | Không |
| Finance VAT | — | **Không** gọi từ dashboard |

### 7.5 File dự kiến đụng (khi được duyệt Phase C)

**FE:** `apps/admin/app/dashboard/page.tsx`; có thể tách `apps/admin/components/dashboard/*`; i18n `vi.ts`; types `DashboardStats` nếu mở rộng.

**BE (chỉ nếu owner chốt chỉnh KPI):** `admin.repository.ts` `getDashboardStats`; spec `admin.service.spec.ts` / commercial exclusion; **không** migration.

**Không đụng:** payment webhook, fulfillment worker, Finance VAT services, Operations exception engine (chỉ link).

### 7.6 Effort ước lượng

| Hạng | Effort |
|------|--------|
| FE cockpit layout + soft-fail + drill-down links (không đổi KPI) | 1–2 ngày |
| Chỉnh KPI definitions (paidAt, backlog PAID, labels) + tests | 0.5–1 ngày |
| Optional activity strip + period filter 7d/30d via summary | 0.5–1 ngày |
| Permission health read cho dashboard roles | 0.5 ngày + review RBAC |

### 7.7 Rủi ro & kiểm soát

| Rủi ro | Kiểm soát |
|--------|-----------|
| Regression số DT / nhầm payment count | Spec repository + so sánh Orders summary cùng kỳ trước ship |
| Promise.all health làm trắng trang | Soft-fail health; render business khi dashboard OK |
| Nhầm «Production Ready» | Empty scan state; không default 100 trên UI mới |
| Trùng Finance/Operations | Copy + link out; không nhúng VAT tables |
| Performance period dài | Aggregate only; cấm findMany all orders |
| Role SUPPORT/ACCOUNTANT | Giữ RBAC hiện tại; không mở dashboard vượt permission |

---

## 8. Trả lời Acceptance Criteria Phase A

1. **Số liệu lấy từ đâu?**  
   Chủ yếu `GET /admin/dashboard` (`AdminRepository.getDashboardStats`) + `GET /admin/system/health` (summary/version). Chi tiết xem §2.

2. **Chỉ số đúng / nguy cơ sai?**  
   Đúng hướng PAID cho DT; rủi ro: `createdAt` vs `paidAt`, `ordersCount` gồm chưa thanh toán, backlog thiếu PAID, payment count ≠ order, health default 100, failed payments chưa exclude admin-test. §3.

3. **API tái sử dụng?**  
   `orders/summary`, `orders`, `operations/*`, agent overview, monitoring activity, system health, esim-ops dashboard. §2.4.

4. **API mới?**  
   Không bắt buộc. Ưu tiên mở rộng DTO `GET /admin/dashboard` nếu cần KPI chuẩn hóa.

5. **Không đưa vào Dashboard?**  
   VAT packs, full health scanner, eSIM P&L USD, autofix, KPI không có nguồn. §2.5.

6. **Cấu trúc UI mới?**  
   Cockpit 6 khối A–F (§7.1); không thay Operations/Finance hubs.

7. **File dự kiến sửa?**  
   §7.5 — chủ yếu `dashboard/page.tsx` + optional repository KPI.

8. **Migration?**  
   **Không.**

9. **Rủi ro performance / regression?**  
   §6–§7.7; lớn nhất là nhầm định nghĩa DT/LN và ghép permission health làm fail cả trang.

---

## 9. Khuyến nghị nghiệm thu owner

**Phê duyệt hướng:**  
Upgrade `/dashboard` = **Operations Cockpit** (tóm tắt + deep-link), bám Orders profit formula, soft-fail health, không dựng Finance/Operations thứ hai.

**Cần owner chốt trước Phase C (dev):**

1. Revenue theo `paidAt` hay giữ `createdAt`? Field `totalAmount` vs `sellAmount`/`customerPaid`?  
2. Có hiển thị **Lợi nhuận** trên Tổng quan (cùng công thức Đơn hàng) không?  
3. Backlog chỉ PAID hay giữ như hiện tại?  
4. Có cho role `admin.dashboard` đọc health summary (nới permission) không?  
5. Có cần period filter 7 ngày / tháng ngay wave 1 không?

---

## 10. Giới hạn thực hiện (đã tuân thủ)

- Phase A only: audit + đề xuất.  
- Không sửa source ứng dụng ngoài file báo cáo này.  
- Không migration · commit · deploy · stress prod.

**Báo cáo dừng tại đây — chờ owner nghiệm thu Phase A và phê duyệt Phase B/C.**
