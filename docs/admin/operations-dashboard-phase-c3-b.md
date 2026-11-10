# Cardon Admin — Operations Dashboard · Phase C3-B

**Ngày:** 2026-11-10  
**Phạm vi:** Business & Operations Integration QA  
**Môi trường:** LOCAL ONLY — `cardon-local-full` · `http://admin.localhost`  
**Trạng thái:** Báo cáo hoàn tất · **không** sửa code · **không** tạo payment/đổi trạng thái đơn · **không** commit/deploy · **không** sang C3-C  
**Verdict tổng:** **PASS with notes** (một số case live **NOT VERIFIED** do thiếu dữ liệu retail trong kỳ hiện tại)

Screenshot: `docs/admin/visual-qa-c3b/`

---

## 0. Môi trường & phương pháp

| Hạng mục | Giá trị |
|----------|---------|
| Stack | Docker `cardon-local-full` (API/admin/postgres healthy) |
| Actor | `superadmin@cardon.vn` (`SUPER_ADMIN`) — chỉ để đọc dashboard/API |
| Dữ liệu | READ-ONLY trên DB local `cardon` |
| Fixture | **Không** tạo trên shared local (theo giới hạn) |
| Timezone | `Asia/Ho_Chi_Minh` — period chips `today` / `last7` / `month` |

### Phương pháp đối chiếu

1. `GET /api/v1/admin/dashboard?period=…`  
2. SQL mirror scope C1 (`dashboardRetailOrderWhere`):  
   `deleted_at IS NULL` · `channel=B2C` · không eSIM item · không `client_trace.adminTest=true`  
3. Orders Summary: `GET /admin/orders/summary` (B2C + `excludeProductType=ESIM`)  
4. Finance profit: `GET /admin/finance/profit` (đối chiếu phạm vi — **khác** cockpit)  
5. Drill-down: mở URL Exception Center + xác minh danh sách thực tế

---

## 1. Backlog (P0)

### 1.1 SQL snapshot (retail) ↔ API

| Bucket | Điều kiện | SQL retail | API `backlog.*` | UI |
|--------|-----------|:----------:|:---------------:|----|
| Chờ giao | PAID + PENDING | **0** | `pendingDelivery=0` | Empty «Không có đơn tồn» |
| Đang xử lý | PAID + PROCESSING | **0** | `processing=0` | (cùng empty) |
| Chờ admin retry | PAID + WAITING_ADMIN_RETRY | **0** | `waitingAdminRetry=0` | |
| Cần kiểm tra | PAID + NEED_MANUAL_REVIEW | **0** | `needManualReview=0` | |

**PASS** — API khớp SQL retail.

### 1.2 Exclusion checks

| Case | Quan sát SQL | Kết luận |
|------|--------------|----------|
| EXPIRED + PENDING | 36 retail (73 raw) | **Không** vào backlog ✅ |
| PAID + COMPLETED | 22 retail | **Không** vào backlog ✅ |
| PAID + FAILED | 0 retail (1 raw non-retail path) | Không vào 4 bucket C1 ✅ |
| PAID + NEED_MANUAL_REVIEW raw B2C | **4** | Toàn bộ `has_esim=true` |
| Trong đó admin-test | 0 | — |
| Retail NEED_MANUAL_REVIEW | **0** | eSIM bị loại khỏi cockpit ✅ |

**Không đếm trùng bucket:** 4 fulfillment status loại trừ nhau theo enum — SQL/API consistent.

### 1.3 Drill-down

| Bucket | Href | Orders list quan sát |
|--------|------|----------------------|
| pending | `/orders?ex=pending` | Exception = Chờ giao · PAID+PENDING · **Không có đơn hàng** |
| processing | `/orders?ex=processing` | (cùng pattern; API list total 0) |
| waitingRetry | `/orders?ex=attention` | default `attn=WAITING_ADMIN_RETRY` |
| needReview | `/orders?ex=attention&attn=NEED_MANUAL_REVIEW` | Exception bật · exclude ESIM · **Không có đơn hàng** |

Client `OrdersListPageClient` (exception mode): `paymentFilter=PAID` + fulfillment theo bucket + **không** date filter + B2C `excludeProductType=ESIM` → khớp scope backlog cockpit.

**Screenshot:** `docs/admin/visual-qa-c3b/drilldown-need-review-empty-retail.png`

### 1.4 Ghi chú vận hành (không FAIL cockpit)

- 4 đơn eSIM `NEED_MANUAL_REVIEW` **không** hiện ở retail Exception Center (đúng C1).  
- Chúng xuất hiện ở **eSIM Ops** (`/esim-ops`, KPI «Cần xử lý / thất bại · Review 1» trong cửa sổ 7 ngày; mã ví dụ `ORD-20261107-895F42`).  
- Khi `backlog` total = 0, UI chỉ `EmptyState` — **không** render StatCard/href từng bucket (không click được từ dashboard). Drill-down vẫn verify được bằng URL.

| Mục | Kết quả |
|-----|---------|
| Backlog KPI vs DB | **PASS** |
| Exclusion unpaid/completed/esim | **PASS** |
| Drill-down list khớp filter | **PASS** (empty đúng) |
| Click bucket khi có đơn tồn retail | **NOT VERIFIED** (local không có retail backlog) |

---

## 2. Revenue & Profit (P0)

### 2.1 Kỳ dashboard hiện tại (today / last7 / month=2026-11-01→10)

| Nguồn | revenue | profit | paidOrderCount | successAttempt |
|-------|--------:|-------:|---------------:|---------------:|
| API dashboard | 0.00 | 0.00 | 0 | 0 |
| SQL retail paidAt trong kỳ | 0 | 0 | 0 | 0 |
| Orders Summary Nov PAID exclude ESIM (`createdAt`) | 0.00 | 0.00 | 0 | — |

**PASS** — cockpit ↔ SQL ↔ Orders Summary cùng 0 cho Nov retail.

**Lý do 0:** 5 payment SUCCESS trong Nov 2026 đều là **eSIM** → bị loại retail scope.

### 2.2 Đối chiếu lịch sử Oct 2026 (SQL + Orders Summary — ngoài chip UI)

Window paidAt / createdAt Oct (retail, không eSIM, không admin-test):

| Metric | SQL (paidAt EXISTS Oct) | Orders Summary Oct PAID exclude ESIM |
|--------|------------------------:|-------------------------------------:|
| orderCount | 7 | 7 |
| revenue (`sellAmount`) | 93,720,000.00 | 93,720,000.00 |
| providerCost | 90,073,000.00 | 90,073,000.00 |
| gatewayFee | 721,645.00 | 721,645.00 |
| profit | 2,925,355.00 | 2,925,355.00 |

**PASS** — công thức `profit = sell − cost − fee` khớp Orders Summary khi cùng scope retail.

### 2.3 Finance profit (cùng tháng — **khác định nghĩa**)

| Nguồn | Oct | Nov (→10) |
|-------|-----|-----------|
| Finance `/admin/finance/profit` | revenue **93,928,000** · orders **9** · grossProfit **3,767,972** | revenue **476,000** · orders **4** |
| Cockpit C1 retail | Oct SQL **93,720,000** / 7 | **0** |

**Root cause lệch (không phải bug cockpit):** Finance `calculateProfit` dùng:

- `paymentStatus=PAID` + **`fulfillmentStatus=COMPLETED`**
- Lọc **`createdAt`** (không `paidAt`)
- Revenue từ **`totalAmount`**
- Cost từ **provider mapping** (không `order.providerCost`)
- **Không** exclude eSIM
- Có `EXCLUDE_ADMIN_TEST_ORDERS`

→ So sánh Finance ↔ Dashboard **không cùng phạm vi**. Ghi nhận **PASS (scope documented)** / không FAIL cockpit.

### 2.4 Case matrix yêu cầu

| Case | Dữ liệu LOCAL | Kết quả |
|------|---------------|---------|
| 1. Tạo hôm trước, thanh toán hôm nay | Không có retail pair khác ngày VN | **NOT VERIFIED** |
| 2. Tạo hôm nay, TT ngày khác | Không có | **NOT VERIFIED** |
| 3. Chưa thanh toán | EXPIRED/WAITING không vào revenue (Nov retail created có unpaid; KPI PAID=0) | **PASS** (gián tiếp) |
| 4. Admin-test | `ORD-20261026-496306` SUCCESS 78,000 — loại khỏi retail/SQL cockpit | **PASS** |
| 5. eSIM | 5 SUCCESS Nov + 12 all-time — loại khỏi cockpit; Finance Nov vẫn thấy | **PASS** |
| 6. Nhiều payment attempts / 1 order | **0** order có >1 payment row | **NOT VERIFIED** |

| Mục | Kết quả |
|-----|---------|
| Revenue/Profit kỳ hiện tại DB=API=UI | **PASS** |
| Công thức vs Orders Summary (Oct) | **PASS** |
| Finance cùng số với Dashboard | **N/A / khác scope** (đã giải thích) |
| Cross-day paidAt cases | **NOT VERIFIED** |

---

## 3. Payment Attempts (P0)

### 3.1 Kỳ hiện tại

| Metric | SQL retail | API | UI |
|--------|-----------:|----:|----|
| SUCCESS (`paidAt` in period) | 0 | `successAttemptCount=0` | TT thành công **0** + hint attempts |
| FAILED (`updatedAt` in period, status FAILED) | 0 (toàn DB **0** row FAILED) | `failedAttemptCount=0` | TT thất bại **0** |

**PASS** cho kỳ hiện tại.

### 3.2 Quy tắc quan sát thêm

| Quy tắc | Bằng chứng |
|---------|------------|
| Đếm payment rows, không distinct order | Oct retail: success attempts **7** = 7 orders (1:1); không có multi-attempt để stress |
| SUCCESS vs FAILED không cộng nhầm | Không có FAILED rows trong DB |
| Admin-test / eSIM loại khỏi attempt retail | Nov SUCCESS 5 eSIM → attempts cockpit 0 ✅ |
| Retry = row mới | **NOT VERIFIED** (không có multi-row) |

---

## 4. Provider Errors (P1)

| Check | Kết quả |
|-------|---------|
| API `providerErrors` today/last7/month | **0** |
| API `providerErrorsScope` | **`SYSTEM`** ✅ |
| SQL `provider_logs.status=FAILED` trong Nov window | **0** |
| SQL all-time FAILED | **3** (tháng 7 & 9 — ngoài kỳ chip) |
| UI label «Lỗi Provider toàn hệ thống» | ✅ có trên dashboard |
| Không trộn Payment FAILED | Payment FAILED rows = 0; provider riêng bảng |
| Drill-down `/providers` | Href `DASHBOARD_ROUTES.providers` = `/providers` — **verify URL mapping PASS**; session hết hạn khi mở page → screenshot providers **NOT VERIFIED** lần này |

| Mục | Kết quả |
|-----|---------|
| Scope SYSTEM + label | **PASS** |
| Count khớp kỳ | **PASS** (0=0) |
| Non-zero period live | **NOT VERIFIED** |

---

## 5. Luồng vận hành tổng hợp

1. Mở `/dashboard` → KPI retail 0, backlog empty, Pay/NCC 0.  
2. Backlog không có StatCard khi empty → không click bucket từ UI.  
3. Mở thủ công Exception Center need-review → empty retail (đúng).  
4. eSIM attention nằm ở `/esim-ops` (đúng tách scope).  
5. Không thực hiện retry/refund/cancel (đúng giới hạn).

**Kết luận vận hành:** Cockpit **đúng** với retail B2C non-eSIM. Nhân viên xử lý eSIM phải dùng **eSIM Ops**, không kỳ vọng backlog retail. Với local hiện tại thiếu retail tồn → **không** nghiệm thu end-to-end «click backlog → sửa đơn» trên dữ liệu thật.

---

## 6. Issue / đề xuất (không tự sửa)

| ID | Mức | Mô tả | Đề xuất |
|----|-----|-------|---------|
| C3B-N1 | Info | Không có retail backlog / multi-attempt / FAILED payment trong LOCAL kỳ hiện tại | Owner duyệt fixture **test DB cô lập** hoặc seed QA read-only riêng → verify non-empty drill-down |
| C3B-N2 | Info | Finance profit ≠ Dashboard (scope/công thức khác) | Tài liệu hoá cho ops; không «sửa» cockpit để khớp Finance trừ khi product yêu cầu |
| C3B-N3 | Low | Empty backlog ẩn StatCard → mất shortcut Exception Center | Optional UX: vẫn hiện 4 bucket = 0 có link (C3-C / polish) |
| C3B-N4 | Info | Cross-day createdAt≠paidAt chưa có mẫu retail | Fixture cô lập khi làm sâu paidAt vs Orders Summary |

**Không phát hiện FAIL** công thức C1 trên dữ liệu đối chiếu được.

---

## 7. Bảng verdict

| Hạng mục | Kết quả |
|----------|---------|
| Backlog KPI / exclusion | **PASS** |
| Backlog drill-down (empty đúng) | **PASS** |
| Backlog non-empty click flow | **NOT VERIFIED** |
| Revenue/Profit kỳ hiện tại | **PASS** |
| Revenue/Profit vs Orders Summary (Oct) | **PASS** |
| vs Finance | **PASS (khác scope — documented)** |
| Payment SUCCESS/FAILED kỳ hiện tại | **PASS** |
| Multi-attempt / FAILED rows | **NOT VERIFIED** |
| Provider errors SYSTEM | **PASS** |
| Provider non-zero + page screenshot | **NOT VERIFIED** / partial |

---

## 8. Giới hạn đã tuân thủ

- LOCAL ONLY · READ-ONLY business data  
- Không sửa source / Prisma / payment / fulfillment / provider logic  
- Không tạo payment thật · không đổi trạng thái đơn  
- Không staging/production · không commit/push/PR/deploy  
- **Không** tự chuyển C3-C  

**C3-B hoàn tất báo cáo. Chờ owner nghiệm thu.**
`)