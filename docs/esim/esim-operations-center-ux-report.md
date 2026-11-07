# eSIM Operations Center — UX Report

Ngày: 2026-11-07. Phạm vi: nâng cấp UI/UX module Đơn hàng eSIM (Admin). Không đổi nghiệp vụ payment/fulfillment/pricing/FX/Airalo. Không migration. Không bật eSIM production. Không triển khai production.

## 1. Cấu trúc giao diện mới

Ba trang giữ URL cũ, gắn chung **eSIM Operations Center** qua `EsimOpsShell`:

| Route | Vai trò |
| --- | --- |
| `/esim-ops` | Danh sách đơn + KPI + tab lọc nhanh + báo cáo thu gọn |
| `/esim-ops/:id` | Chi tiết đơn: timeline, khách, sản phẩm, snapshot, payment, fulfillment, mã cài, cảnh báo |
| `/esim-ops/payments` | Thanh toán eSIM, liên kết về chi tiết đơn |
| `/esim-ops/attempts` | Nhật ký cấp (fulfillment attempts), liên kết về chi tiết đơn |

### Danh sách đơn

1. Page header: tiêu đề, mô tả vận hành, làm mới, xuất CSV, health NCC.
2. KPI gọn (6 ô): Tổng / Chờ thanh toán / Đã thanh toán / Đang xử lý / Hoàn tất / Cần xử lý·thất bại. Click áp filter API.
3. Banner «Đã thu, chưa cấp eSIM» khi dashboard có số > 0.
4. Tab lọc nhanh (Tất cả, Chờ thanh toán, Đã thanh toán, Đang fulfillment, Hoàn tất, Cần xử lý) — map đúng `paymentStatus` / `fulfillmentStatus` / `paidUnfulfilled` hiện có.
5. Search + khoảng ngày; bộ lọc nâng cao thu gọn (thanh toán, fulfillment, thị trường, lane).
6. Chip điều kiện đang áp dụng + xóa bộ lọc.
7. Bảng desktop (mã đơn+copy+thời gian, khách, sản phẩm, thị trường, số tiền charge, payment, fulfillment, chi tiết).
8. Mobile: order cards.
9. Báo cáo doanh thu / gói / economics: thu gọn mặc định (giữ Phase 4).

### Chi tiết đơn

- Header: mã đơn, badge payment/fulfillment, copy, làm mới, recover / đóng claim (theo quyền).
- Khu vực **Cần kiểm tra** khi paid-unfulfilled / lỗi / trạng thái attention.
- Cột chính: khách, sản phẩm, giá đã khóa, thanh toán (+ link payments), fulfillment (+ link attempts), mã cài (reveal theo quyền), audit admin.
- Cột phụ sticky: **Tiến trình đơn** evidence-based (không tự tạo timestamp).

## 2. File đã thay đổi / thêm

| File | Việc |
| --- | --- |
| `apps/admin/components/esim-ops/EsimOpsShell.tsx` | Section nav Đơn hàng / Thanh toán / Nhật ký cấp |
| `apps/admin/components/esim-ops/esim-ops-ui.ts` | Format tiền, gateway label, tone, timeline builder |
| `apps/admin/components/esim-ops/esim-ops-ui.test.ts` | Unit timeline + format |
| `apps/admin/components/esim-ops/CopyIdButton.tsx` | Nút sao chép ID |
| `apps/admin/components/esim-ops/EsimOpsTimeline.tsx` | Timeline UI |
| `apps/admin/app/esim-ops/page.tsx` | Redesign danh sách |
| `apps/admin/app/esim-ops/[id]/page.tsx` | Redesign chi tiết |
| `apps/admin/app/esim-ops/payments/page.tsx` | Shell + responsive + `?q=` |
| `apps/admin/app/esim-ops/attempts/page.tsx` | Shell + responsive + `?q=` |
| `apps/admin/lib/esim-admin-ui.test.ts` | Cập nhật assertion copy mới |
| `apps/admin/app/esim-ops/[id]/esim-ops-*.test.tsx` | Mock `usePathname` |

Không sửa backend API, DTO, pricing, FX, payment status machine, Airalo adapter, queue.

## 3. API sử dụng (Phase 4 hiện có)

| Method | Path | UI dùng |
| --- | --- | --- |
| GET | `/admin/esim-ops/health` | Badge NCC |
| GET | `/admin/esim-ops/dashboard` | KPI + báo cáo |
| GET | `/admin/esim-ops/orders` | Danh sách + phân trang + filter |
| GET | `/admin/esim-ops/orders/export` | CSV |
| GET | `/admin/esim-ops/orders/:id` | Chi tiết + timeline + snapshot |
| POST | `/admin/esim-ops/orders/:id/recover` | Đọc lại NCC |
| POST | `/admin/esim-ops/orders/:id/reveal` | Hiện mã cài |
| POST | `/admin/esim-ops/orders/:id/close-query-claim` | Đóng claim |
| GET | `/admin/esim-ops/payments` | Trang thanh toán |
| GET | `/admin/esim-ops/attempts` | Nhật ký cấp |

Quyền: `orders.read` (đọc), `orders.retry` (recover / close claim). Không thêm nút capture/refund.

## 4. Chức năng đã hoàn thành

- [x] Header + mô tả Operations Center
- [x] KPI từ dashboard API, click để lọc
- [x] Tab lọc nhanh map trạng thái nghiệp vụ thật
- [x] Search / filter / clear / pagination / page size
- [x] Bảng desktop + card mobile
- [x] Chi tiết: timeline evidence-based, snapshot, payment, fulfillment, profile reveal
- [x] Cảnh báo cần xử lý
- [x] Liên kết hai chiều Orders ↔ Payments ↔ Attempts (`?q=`)
- [x] Giữ CSV export + báo cáo Phase 4 (thu gọn)
- [x] Không giả dữ liệu để làm đẹp UI

## 5. API / field còn thiếu (không bịa)

Bộ lọc danh sách đơn **không** hỗ trợ trên `EsimOpsOrderQueryDto` hiện tại:

- `gateway` / `currency` (có trên dashboard + payments, không trên list orders)
- `countryIso` / package / variant id

List item cũng **không** trả dung lượng / thời hạn tách field (chỉ `packageTitle`, `countryIso`, `providerProductCode`). UI hiển thị những gì API có; ghi chú trong bộ lọc nâng cao.

Timeline không có event log riêng: mốc thời gian lấy từ `createdAt`, `payments[].createdAt/paidAt`, `attempts[].createdAt/completedAt`. Bước không có bằng chứng → «Chưa có bằng chứng thời gian».

## 6. Test results

```
vitest (admin):
  lib/esim-admin-ui.test.ts                         pass
  components/esim-ops/esim-ops-ui.test.ts            pass
  app/esim-ops/[id]/esim-ops-close-claim.test.tsx  pass
  app/esim-ops/[id]/esim-ops-reveal.test.tsx       pass
→ 26 tests passed
```

Rebuild image `cardon-admin:local-full` + recreate container admin để nghiệm thu trình duyệt (xem mục screenshot).

## 7. Screenshot

Đã chụp trên `http://admin.localhost` sau rebuild `cardon-admin:local-full`. Lưu tại `docs/esim/`:

| File | Nội dung |
| --- | --- |
| [`esim-ops-center-list-desktop.png`](./esim-ops-center-list-desktop.png) | Danh sách desktop: KPI, tab, bảng |
| [`esim-ops-center-list-mobile.png`](./esim-ops-center-list-mobile.png) | Danh sách viewport hẹp |
| [`esim-ops-center-detail-desktop.png`](./esim-ops-center-detail-desktop.png) | Chi tiết `ORD-20261107-895F42` |
| [`esim-ops-center-detail-mobile.png`](./esim-ops-center-detail-mobile.png) | Chi tiết viewport hẹp |
| [`esim-ops-center-attention.png`](./esim-ops-center-attention.png) | Đơn đã thu / chưa cấp — cảnh báo + timeline lỗi |

## 8. Chưa hoàn thành / giới hạn

- Chưa bổ sung API filter gateway/currency/country/package cho list orders (cần quyết định Phase sau nếu muốn).
- Chưa có customer ID riêng trên detail payload (chỉ name/email/phone).
- Chưa có data/duration tách cột nếu packageTitle đã gộp chuỗi.
- Screenshot nghiệm thu phụ thuộc rebuild container admin local.
- Không đổi menu sidebar ngoài module; không gộp ba trang thành một SPA.

## 9. Nghiệm thu

Dừng tại UX Operations Center. Chờ nghiệm thu. Không sang phase tiếp theo. Không deploy production. Không bật `customerEsimEnabled`.
