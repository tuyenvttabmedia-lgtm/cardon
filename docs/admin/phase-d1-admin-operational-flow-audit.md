# Cardon Admin — Phase D1: Admin Operational Flow Audit

**Ngày:** 2026-11-10  
**Phạm vi:** D1-A → D1-E (Orders/Exception, Payment/Finance, Provider, Agent, eSIM Ops)  
**Môi trường:** LOCAL ONLY — `cardon-local-full` · `http://admin.localhost`  
**Build:** `6035.2 AGENT REGISTRATION & KYC CENTER`  
**Giới hạn:** Read-only nghiệp vụ · không sửa code/schema · không payment/retry/refund/cancel/credit/provider-call thật · không Health Scan · không commit/deploy  
**Actor chính:** `superadmin@cardon.vn` (`SUPER_ADMIN`)  
**Actor thiếu quyền:** `maint@keyon.vn` (`ACCOUNTANT`) — login live session này **thất bại** (password local không khớp); RBAC 403 dựa trên bằng chứng C3-A + code path  
**Screenshot:** `docs/admin/visual-qa-d1/`

**Kết luận tổng:** Admin đủ khung vận hành để tìm đơn, tách payment/fulfillment, theo dõi eSIM NMR và Agent wallet; còn **rủi ro thao tác nhầm** (thiếu confirm trên retry/recovery/refund retail + eSIM recover), **lỗ hổng điều hướng Payment cho SUPER_ADMIN**, **không có payment detail**, và **Provider status chỉ phủ ESALE + recentFailures lẫn SUCCESS**.

---

## 1. Tổng quan kiến trúc Admin và route

```
Browser (admin.localhost)
  → Next Admin UI (RequirePermission / canAccessNavItem)
  → GET/POST /api/v1/admin/* (Nest Controller @Permissions)
  → Service → Repository → Postgres
```

| Khu vực | UI route | API chính | Permission |
|---------|----------|-----------|------------|
| Cockpit | `/dashboard` | `GET /admin/dashboard` | `admin.dashboard` |
| Orders retail | `/orders` | `GET /admin/orders`, `/summary`, `/orders/:id/detail` | `orders.read` |
| Orders agent | `/orders/agent` | `GET /admin/orders?channel=AGENT` | `orders.read` |
| Order detail (card/topup) | `/orders/:id` | detail / `POST .../retry` / `.../recovery` / `.../resend-email` | read + `orders.retry` |
| Exception Center | `/orders?ex=1` (+ `attn=`) | cùng list API, không date KPI | `orders.read` |
| eSIM Ops | `/esim-ops`, `/esim-ops/:id` | `/admin/esim-ops/orders*` · `POST .../recover` | `orders.read` / `orders.retry` |
| Payments | `/payments` | `GET /admin/payments`, manual-review, `POST .../resolve` | `payments.view` / `payments.review` |
| Finance | `/finance/*` | finance panels | `finance.view` |
| Providers | `/providers`, `/providers/:id` | `/admin/providers/status`, detail, sync/test | `providers.manage` |
| Agents | `/agents/overview`, `/agents/:id` | `/admin/agents*`, `/admin/agent-center/*` | `users.read` / `agents.manage` / `ledger.view` |
| Refunds | `/refunds` | `/admin/refund-requests*` | `refund.*` |
| Operations | `/operations/*` | reconciliation / exceptions / manual | `reconciliation.read` / `finance.view` |
| Monitoring | `/monitoring/*` | activity / queues / api-logs | `activity.read` … |

**Tách kênh đơn:** Retail B2C mặc định `excludeProductType=ESIM`; eSIM đi `/esim-ops`; agent API đi `/orders/agent`. Chi tiết đơn eSIM mở từ `/orders/:id` sẽ `router.replace` sang `/esim-ops/:id`.

---

## 2. Ma trận kiểm tra D1-A → D1-E

| ID | Hạng mục | Kết quả | Bằng chứng ngắn |
|----|----------|---------|-----------------|
| D1-A1 | Danh sách + bộ lọc đơn | **PASS** | UI Exception Center + quick filters; API `take`/`paymentStatus`/`fulfillmentStatus`/`q` 200 |
| D1-A2 | Tìm theo mã đơn / khách / TT | **PASS** | `q=ORD` trả đơn; search box debounce 350ms |
| D1-A3 | Tách `paymentStatus` vs `fulfillmentStatus` | **PASS** | List 2 cột badge; SQL + API sample đồng thời PAID+COMPLETED / EXPIRED+PENDING |
| D1-A4 | PAID chưa giao | **PASS** (cấu trúc) / **NOT VERIFIED** (dữ liệu retail) | Bucket «Chờ giao» có; local B2C non-eSIM PAID+PENDING = **0** |
| D1-A5 | PROCESSING | **NOT VERIFIED** | Filter API 200 count 0; SQL không có PROCESSING |
| D1-A6 | WAITING_ADMIN_RETRY | **NOT VERIFIED** | Filter API 200 count 0 |
| D1-A7 | NEED_MANUAL_REVIEW | **PASS** (eSIM) / empty retail | API eSIM NMR=4; B2C `excludeProductType=ESIM` NMR=0 |
| D1-A8 | FAILED / CANCELLED / EXPIRED / REFUNDED | **PASS** một phần | FAILED fulfillment=1 (eSIM); EXPIRED = paymentStatus; CANCELLED **không** thuộc enum fulfillment API; REFUNDED payment filter=0 |
| D1-A9 | Chi tiết + lịch sử xử lý | **PASS** | Order detail tabs + `auditTimeline`/`fulfillmentTimeline`; eSIM `adminActions` + timeline |
| D1-A10 | Retry/resend/replace/cancel/refund UX | **FAIL** (confirm) | Nút retail/eSIM gọi API **không** confirm; quyền `orders.retry` có gate |
| D1-B1 | Payment list + filter | **PASS** | `/payments` list total 105; filter gateway/status/date/amount |
| D1-B2 | Payment attempt ≠ Order | **PASS** | List payment reference riêng; order detail tab Payment / eSIM payments section |
| D1-B3 | SUCCESS / FAILED / PENDING / EXPIRED | **PASS** / **NOT VERIFIED** FAILED | UI enum đủ; DB local chỉ SUCCESS(34)+EXPIRED(71); FAILED=0 |
| D1-B4 | paidAt vs createdAt | **PASS** | eSIM detail: Tạo vs Paid khác timestamp |
| D1-B5 | Reconciliation field | **PASS** (hiển thị) | Cột Reconciliation = PENDING trên list |
| D1-B6 | Fee / cost / revenue / profit | **PASS** (Orders KPI) | Orders summary cards doanh thu / giá vốn / phí / lãi |
| D1-B7 | Refund / bất thường | **PASS** (route) / **NOT VERIFIED** (data) | `/refunds` + API refund-requests total 0; unknown webhooks list dài |
| D1-B8 | Phân quyền tài chính | **PASS** (code+C3) / **NOT VERIFIED** (live ACCOUNTANT) | `@Permissions('payments.view')`; C3-A ACCOUNTANT 403 dashboard/providers |
| D1-C1 | Danh sách NCC | **FAIL** (coverage) | UI/API status chỉ **ESALE**; DB còn AIRALO ACTIVE, ESIM_GO INACTIVE |
| D1-C2 | Trạng thái hoạt động | **PASS** (ESALE) | ACTIVE + lastError hiển thị |
| D1-C3 | Lịch sử lỗi / ProviderLog | **FAIL** | `recentFailures` trả log mới nhất **kể cả SUCCESS** |
| D1-C4 | Phân biệt lỗi Provider vs Payment | **PASS** một phần | Order/eSIM tách payment vs provider sections; status board không có eSIM NCC |
| D1-C5 | Cấu hình NCC | **PASS** (read) | Detail + runtime settings APIs tồn tại; không gọi mutate |
| D1-C6 | RBAC xem/sửa | **PASS** (code+C3) | `providers.manage`; ACCOUNTANT thiếu quyền (C3-A) |
| D1-C7 | Cảnh báo can thiệp | **PASS** một phần | lowBalanceWarning / lastError; nút sync/test = rủi ro cao nếu bấm |
| D1-D1 | Agent list + KYC | **PASS** | agent-center dashboard active=1; kyc-queue empty |
| D1-D2 | Wallet | **PASS** | wallet + wallet-center/summary balance/held/available |
| D1-D3 | Nạp tiền / biến động | **PASS** (read) | deposits + ledger CREDIT TOPUP |
| D1-D4 | API / trừ tiền | **NOT VERIFIED** | Không có DEBIT mẫu trong take=3 gần nhất |
| D1-D5 | Đối soát số dư | **PASS** một phần | summary + ledger before/after; statement tab có confirm riêng |
| D1-D6 | Khóa/mở đại lý | **PASS** (UX) | Suspend = prompt lý do; Reactivate = `window.confirm` |
| D1-D7 | Audit + quyền | **PASS** | activity/login-history APIs; credit UI yêu cầu gõ xác nhận |
| D1-E1 | Danh sách eSIM | **PASS** | `/esim-ops` filters + API list |
| D1-E2 | Order + fulfillment status | **PASS** | NMR detail PAID + NEED_MANUAL_REVIEW |
| D1-E3 | Provider attempts | **PASS** | Detail: «Chưa có lần gọi»; attempts=0 trên đơn mẫu |
| D1-E4 | NEED_MANUAL_REVIEW | **PASS** | 4 đơn; banner «Cần kiểm tra» |
| D1-E5 | Profile / giao eSIM | **PASS** | `profilePresent=false`; section mã cài |
| D1-E6 | Retry / thủ công | **FAIL** (confirm recover) | Nút «Chỉ đọc — không tạo eSIM mới» không confirm; close-claim/pay có confirm |
| D1-E7 | Tách eSIM vs retail Exception | **PASS** | B2C exclude ESIM; detail redirect; nav riêng |

---

## 3. Permission / RBAC matrix

| Permission | SUPER_ADMIN | ACCOUNTANT (C3-A + code) | Ghi chú nav |
|------------|-------------|--------------------------|-------------|
| `admin.dashboard` | ✓ | ✗ 403 | `/dashboard` |
| `orders.read` | ✓ | ✓ (allowlist) | Orders / eSIM Ops |
| `orders.retry` | ✓ | theo matrix DB | Retry/recover/recovery |
| `payments.view` | ✓ (API) | ✓ | **Nav `/payments` chỉ `visibleForRoles: SUPPORT|ACCOUNTANT` → SUPER_ADMIN không thấy sidebar** |
| `payments.review` | ✓ | theo matrix | Resolve manual review |
| `providers.manage` | ✓ | ✗ 403 | `/providers` |
| `finance.view` | ✓ | ✓ | `/finance/*` |
| `users.read` | ✓ | allowlist agents | Agent center |
| `ledger.view` | ✓ | theo matrix | Wallet tab |
| `agents.manage` / `agents.credit` | ✓ | hạn chế | Suspend / credit |
| `refund.*` | ✓ | ✓ (C3 refund docs) | `/refunds` |
| `activity.read` | ✓ | ✗ 403 | Monitoring activity |

`canAccessNavItem`: `visibleForRoles` được kiểm **trước** bypass `SUPER_ADMIN` → đây là nguyên nhân nav Payments bị ẩn với SUPER_ADMIN dù API vẫn 200.

Users local có sẵn: SUPER_ADMIN, ACCOUNTANT, ADMIN (`system@cardon.local`). **Không** có SUPPORT để verify nav Payments theo thiết kế.

---

## 4. Luồng PASS / FAIL / NOT VERIFIED

### PASS (có bằng chứng)

- Orders list tách payment/fulfillment; Exception Center 3 bucket; search `q`.
- Retail mặc định loại eSIM; eSIM Ops riêng; redirect detail eSIM.
- Payment list + status filter + reconciliation column; unknown webhooks queue.
- eSIM NMR: paidAt ≠ createdAt; adminActions; timeline; recover query-only copy.
- Agent overview/wallet/ledger/deposits đọc được; credit UI có typed confirm.
- Provider ESALE card + lastError + action buttons hiển thị (không click).

### FAIL

| Issue | Mức | Tóm tắt |
|-------|-----|---------|
| D1-ISSUE-01 | **High** | Retail order actions (retry / Đổi NCC / Đánh dấu hoàn tất / Hoàn tiền) **không confirm** |
| D1-ISSUE-02 | **High** | eSIM `recover()` **không confirm** (close-claim/pay thì có) |
| D1-ISSUE-03 | **Medium** | SUPER_ADMIN không thấy nav `/payments` (`visibleForRoles`) |
| D1-ISSUE-04 | **Medium** | Không có `GET /admin/payments/:id` / UI payment detail (404) |
| D1-ISSUE-05 | **Medium** | `/admin/providers/status` **lọc bỏ** AIRALO & ESIM_GO |
| D1-ISSUE-06 | **Medium** | `recentFailures` = log gần nhất, **gồm SUCCESS/PROCESSING** |
| D1-ISSUE-07 | **Low** | Payment gateway filter UI thiếu PAYPAL (list có PAYPAL) |

### NOT VERIFIED

- WAITING_ADMIN_RETRY / PROCESSING / PAID+PENDING retail: filter OK, data local = 0.
- Payment FAILED live row: DB = 0.
- Payment REFUNDED / refund_requests items: 0.
- ACCOUNTANT login live session D1: password fail → không re-probe 403 trong phiên này (dựa C3-A).
- SUPPORT actor: không tồn tại local.
- Agent DEBIT / API spend mẫu gần đây: không thấy trong sample ledger.
- Không chạy mutate (retry/refund/sync/test-connection) theo giới hạn D1.

### N/A

- Health Scan / Autofix.
- Tạo fixture / migration / deploy.
- Gọi Provider thật / phát hành eSIM / nạp tiền agent.

---

## 5. Lỗi ảnh hưởng vận hành

1. **Thao tác một click trên đơn PAID cần can thiệp** → nhân viên dễ retry/refund nhầm (ISSUE-01/02).
2. **SUPER_ADMIN vận hành Payment** phải nhớ URL `/payments` hoặc link Cockpit — dễ bỏ sót hàng đợi webhook/manual review (ISSUE-03).
3. **Không drill-down payment attempt** → khó đối chiếu 1 payment ↔ order khi list dài (ISSUE-04).
4. **eSIM provider lỗi không nằm trên `/providers` status** → nhân viên có thể kết luận «NCC ổn» trong khi Airalo/eSIM Go có vấn đề (ISSUE-05).
5. **recentFailures nhiễu SUCCESS** → false signal khi triage (ISSUE-06).
6. **Local retail Exception trống** trong khi eSIM có 4 NMR → đúng tách kênh, nhưng nhân viên mới có thể tìm sai chỗ nếu chỉ nhìn Orders.

---

## 6. Thao tác rủi ro cao (không thực thi trong D1)

| Thao tác | Route / API | Confirm? | Rủi ro |
|----------|-------------|----------|--------|
| Giao lại / retry fulfillment | `POST /admin/orders/:id/retry` | **Không** | Gọi lại fulfillment |
| Đổi NCC / mark fulfilled / refund recovery | `POST /admin/orders/:id/recovery` | **Không** | Đổi trạng thái / hoàn tiền |
| Resend email | `POST .../resend-email` | **Không** | Spam email KH |
| eSIM recover | `POST /admin/esim-ops/orders/:id/recover` | **Không** | Gọi NCC query (không tạo mới theo copy) |
| eSIM close query claim | close-claim API | **Có** (modal + lý do) | Đóng claim |
| Payment resolve | `POST /admin/payments/:id/resolve` | UI review | Duyệt tay |
| Provider test / sync balance / sync products | providers APIs | UI button | Gọi NCC / đổi runtime |
| Agent suspend | suspend API | prompt lý do (Cancel = abort) | Khóa đại lý |
| Agent credit/debit | wallet-center | Typed `XAC NHAN` / `TRU VI` | Đổi số dư |
| Refund approve/execute | `/refunds` | theo refund UI | Tiền |

---

## 7. Danh sách issue (ưu tiên)

### D1-ISSUE-01 — High
- **Route/API:** `/orders/:id` · `POST /admin/orders/:id/retry` · `.../recovery`
- **Mô tả:** `runAction` và các nút recovery/refund gọi thẳng API, không `confirm`.
- **Ảnh hưởng:** Nhầm click trên đơn PAID+NEED_MANUAL_REVIEW → retry/refund/mark_fulfilled.
- **Đề xuất:** Confirm modal phân mức (retry nhẹ / refund+mark_fulfilled nặng); disable double-submit đã có `actionBusy`.

### D1-ISSUE-02 — High
- **Route/API:** `/esim-ops/:id` · `POST /admin/esim-ops/orders/:id/recover`
- **Mô tả:** `recover()` không confirm; close-claim/pay đã có.
- **Ảnh hưởng:** Gọi NCC ngoài ý muốn khi triage NMR.
- **Đề xuất:** Confirm «Chỉ đọc NCC — không tạo eSIM mới».

### D1-ISSUE-03 — Medium
- **Route:** `apps/admin/lib/permissions.ts` NAV `/payments` + `visibleForRoles`
- **Mô tả:** SUPER_ADMIN/ADMIN bị ẩn Payments dù có `payments.view`; direct URL vẫn mở được.
- **Ảnh hưởng:** Ops cao cấp bỏ sót manual review / unknown webhooks.
- **Đề xuất:** Bỏ `visibleForRoles` hoặc thêm SUPER_ADMIN/ADMIN; hoặc đưa Payments vào nhóm Finance luôn visible.

### D1-ISSUE-04 — Medium
- **API:** `GET /admin/payments/:id` → **404** `Cannot GET`
- **Mô tả:** Không có trang/API chi tiết payment attempt.
- **Ảnh hưởng:** Khó đối soát 1-1 payment ↔ order/webhook từ list.
- **Đề xuất:** Thêm read-only payment detail (status, paidAt, orderId, webhook trail, fee).

### D1-ISSUE-05 — Medium
- **API/UI:** `GET /admin/providers/status` filter bỏ `AIRALO` / `ESIM_GO`
- **Mô tả:** Board chỉ ESALE trong khi DB có 3 providers.
- **Ảnh hưởng:** Không giám sát eSIM NCC trên cùng màn hình status.
- **Đề xuất:** Hiển thị eSIM providers (read-only health) hoặc link rõ sang eSIM Ops / config.

### D1-ISSUE-06 — Medium
- **Code:** `AdminRepository.findRecentProviderFailures` — `findMany` không filter `status=FAILED`
- **Bằng chứng API:** 5/5 sample `SUCCESS`/`PROCESSING`
- **Ảnh hưởng:** Nhân viên tưởng «failures» nhưng thấy thành công.
- **Đề xuất:** Filter `FAILED` (và/hoặc rename field `recentLogs`).

### D1-ISSUE-07 — Low
- **UI:** `/payments` gateway select chỉ MEGAPAY/SEPAY
- **Mô tả:** List có PAYPAL; không lọc được từ dropdown.
- **Đề xuất:** Thêm PAYPAL vào `GATEWAYS`.

### D1-ISSUE-08 — Info
- **Dữ liệu local:** Retail Exception NMR/FAILED/WAITING = 0; eSIM NMR = 4
- **Ảnh hưởng:** QA Exception retail cần dataset; prod có thể khác.
- **Đề xuất:** Không tạo fixture trong D1; ghi nhận khi D2.

### D1-ISSUE-09 — Info
- **fulfillmentStatus** API không nhận CANCELLED/EXPIRED (EXPIRED thuộc payment)
- **Ảnh hưởng:** Nhân viên tìm «CANCELLED fulfillment» sẽ 400 nếu gọi sai param; UI quick «Hết hạn» dùng payment filter — OK nếu đúng wire.
- **Đề xuất:** Giữ copy UI rõ «Hết hạn = payment EXPIRED».

---

## 8. Đề xuất thứ tự khắc phục (sau khi owner nghiệm thu D1)

1. **P0 UX an toàn:** ISSUE-01 + ISSUE-02 (confirm destructive/recovery).
2. **P0 điều hướng Payment:** ISSUE-03 (+ optional ISSUE-04 payment detail).
3. **P1 Provider truthfulness:** ISSUE-06 rồi ISSUE-05.
4. **P2 polish:** ISSUE-07 gateway filter; copy EXPIRED (ISSUE-09).
5. **P2 dữ liệu QA:** chuẩn bị dataset local an toàn cho WAITING_ADMIN_RETRY / PROCESSING / payment FAILED (không thuộc D1).

---

## 9. Phân bố dữ liệu local (read-only SQL / API)

| Nguồn | Phân bố |
|-------|---------|
| Orders | EXPIRED+PENDING 73 · PAID+COMPLETED 29 · PAID+NEED_MANUAL_REVIEW 4 · PAID+FAILED 1 |
| Payments | EXPIRED 71 · SUCCESS 34 · FAILED 0 |
| Providers | ESALE ACTIVE · AIRALO ACTIVE · ESIM_GO INACTIVE |
| Provider logs status | PROCESSING 25 · SUCCESS 22 · FAILED 3 |
| Agents | 1 ACTIVE · kyc-queue 0 · balance 1_010_000 · pending deposit 2_000_000 |
| Refund requests | total 0 |

---

## 10. Screenshot evidence

| File | Nội dung |
|------|----------|
| `docs/admin/visual-qa-d1/d1-dashboard.png` | Operations Cockpit |
| `docs/admin/visual-qa-d1/d1-orders-exception.png` | Orders + Exception Center |
| `docs/admin/visual-qa-d1/d1-esim-ops.png` | eSIM Ops list |
| `docs/admin/visual-qa-d1/d1-esim-nmr-detail.png` | NMR detail (capture turn) |
| `docs/admin/visual-qa-d1/d1-payments.png` | Payments list + reconciliation |

API probes: `%TEMP%\cardon-d1-probe2.mjs` … `probe5.mjs` (LOCAL, read-only).

---

## 11. Kết thúc Phase D1

- Báo cáo đã tạo: `docs/admin/phase-d1-admin-operational-flow-audit.md`
- **Không** sửa source code · **không** mutate nghiệp vụ · **không** commit/PR/deploy
- **Chờ owner nghiệm thu D1** trước khi mở phase khắc phục (đề xuất bắt đầu từ ISSUE-01/02/03)
