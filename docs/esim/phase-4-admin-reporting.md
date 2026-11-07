# Phase 4 — Admin và báo cáo eSIM

Ngày: 2026-11-06. Bổ sung màn quản trị trên module eSIM ops và tỷ giá đã có. Không đổi PaymentService bán thẻ, webhook, signer, ví đại lý, MegaPay, PayOS, SePay agent wallet, công thức giá Phase 3, queue hay Airalo adapter. Không bật eSIM production. Không chạy migration. Không sang Phase 5.

## 1. Đã hoàn thành

| Nhóm | Việc |
| --- | --- |
| Đơn eSIM | Danh sách hiện có thêm thị trường, quốc gia, charge snapshot theo currency của đơn. Tìm mã đơn / email / SĐT. Lọc thanh toán, fulfillment, lane, thị trường VN/INTL, khoảng ngày. Chi tiết hiện snapshot đã khóa: catalog, charge, cost, FX rate, FX rate ID, FX as of, pricing locked at, cổng và payment reference. |
| Thanh toán eSIM | Trang riêng, chỉ payment của đơn có variant ESIM. Tìm payment reference hoặc mã đơn. Lọc PayPal/SePay, VND/USD, trạng thái, khoảng ngày. |
| Tỷ giá | Giữ quy tắc ±2% của Phase 3. Thêm từ chối bản DRAFT hoặc PENDING_REVIEW. Hiện người ra quyết định và thời điểm tạo. Tỷ giá đã gắn đơn không có nút sửa. |
| Fulfillment | Danh sách provider attempt, tìm mã đơn, lọc provider và outcome. Metadata request/response đi qua bộ lọc secret sẵn có. |
| Báo cáo | KPI đơn, doanh thu payment SUCCESS tách currency và tách sandbox. Giá vốn và lợi nhuận chỉ khi snapshot charge và cost cùng currency. CSV tối đa 1.000 dòng theo bộ lọc danh sách. |

Dữ liệu sandbox để nguyên: tỷ giá 27.000 vẫn `PENDING_REVIEW`, tỷ giá hiệu lực vẫn 25.500, `customerEsimEnabled` vẫn `false`. Không bấm Phê duyệt hoặc Từ chối trên bản 27.000.

## 2. File thêm và sửa

| File | Việc |
| --- | --- |
| `src/modules/esim/esim-admin.service.ts` | Lọc dashboard, snapshot trên chi tiết, `listPayments`, `listAttempts`, xuất danh sách |
| `src/modules/esim/esim-ops-dashboard.ts` | Doanh thu theo currency của payment; lợi nhuận snapshot cùng currency |
| `src/modules/esim/esim-ops-dashboard.spec.ts` | Không cộng VND với USD; lợi nhuận chỉ khi cùng currency |
| `src/modules/admin/controllers/esim-ops.controller.ts` | Route export, payments, attempts; quyền `orders.read` |
| `src/modules/admin/dto/esim-ops.dto.ts` | Validate bộ lọc mới |
| `src/modules/fx/fx-rate.service.ts` | `reject`, tên người ra quyết định |
| `src/modules/fx/fx-rate.service.spec.ts` | Từ chối 27.000 trong bộ nhớ, không đổi số đã nhập và không đổi tỷ giá EFFECTIVE |
| `src/modules/admin/controllers/settings-admin.controller.ts` | `POST fx-rates/:id/reject`; audit PRICING trên tạo, công bố, phê duyệt, từ chối |
| `apps/admin/app/esim-ops/page.tsx` | Bộ lọc đơn, bộ lọc báo cáo, giá vốn, lợi nhuận, CSV |
| `apps/admin/app/esim-ops/[id]/page.tsx` | Thẻ snapshot; số tiền payment theo currency của payment |
| `apps/admin/app/esim-ops/payments/page.tsx` | Danh sách thanh toán eSIM |
| `apps/admin/app/esim-ops/attempts/page.tsx` | Danh sách lần gọi nhà cung cấp |
| `apps/admin/app/configuration/fx-rates/page.tsx` | Nút Từ chối, người xác nhận, cờ đã dùng |
| `apps/admin/services/api-client.ts` | Client cho các route mới |
| `apps/admin/types/api.ts` | Snapshot, economics, `publishedByName` |

Không có file migration.

## 3. API

Tất cả route đọc eSIM ops yêu cầu JWT và `orders.read`. Route tỷ giá vẫn `SUPER_ADMIN`.

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/api/v1/admin/esim-ops/orders` | Thêm `market`. Item thêm `esimMarket`, `chargeCurrency`, `chargeAmount`, `countryIso` |
| GET | `/api/v1/admin/esim-ops/orders/export` | Cùng bộ lọc, tối đa 1.000 dòng. Khai báo trước `orders/:id` |
| GET | `/api/v1/admin/esim-ops/orders/:id` | Thêm `snapshot` và currency của payment. Không tính lại giá |
| GET | `/api/v1/admin/esim-ops/payments` | `q`, `gateway`, `currency`, `status`, `preset` / `from` / `to`, phân trang |
| GET | `/api/v1/admin/esim-ops/attempts` | `q`, `provider`, `outcome`, phân trang. Meta đã lọc secret |
| GET | `/api/v1/admin/esim-ops/dashboard` | Thêm `market`, `currency`, `gateway`, `paymentStatus` |
| POST | `/api/v1/admin/settings/fx-rates/:id/reject` | DRAFT hoặc PENDING_REVIEW → REJECTED. Không đổi số tỷ giá, không hạ tỷ giá EFFECTIVE |

Audit tỷ giá dùng interceptor `@Audit` resource `PRICING` đã có. Không thêm cột `created_by`. `createdAt` là lúc tạo. `publishedBy` là người công bố, phê duyệt hoặc từ chối. UI ghi người này là người xác nhận.

## 4. Database

Không migration. Không backfill đơn cũ. Không sửa dòng tỷ giá 27.000.

Lợi nhuận không dùng `orders` profit VND cho đơn USD. Không dùng tỷ giá EFFECTIVE hiện tại để tính lại đơn cũ.

## 5. Quy tắc báo cáo

- Doanh thu là tổng payment `SUCCESS`, một payment mỗi đơn. Currency lấy từ payment; nếu trống thì PayPal là USD, cổng còn lại là VND. VND và USD là hai dòng.
- Giá vốn cộng `costAmount` của đơn PAID theo `costCurrency` trên snapshot.
- Lợi nhuận = charge − cost chỉ khi hai currency trên snapshot trùng nhau.
- Đơn charge USD và cost VND nằm ở `unreconciledOrders`. Không quy đổi.
- Đơn thiếu snapshot nằm ở `missingSnapshot`, mỗi đơn một lần.
- `checkoutCostSnapshot.available` vẫn `false`. Provider cost lúc tạo đơn không được dùng làm lợi nhuận vận hành.

## 6. Kiểm thử

Jest:

| Suite | Kết quả |
| --- | --- |
| `fx-rate.rules.spec.ts` | pass |
| `fx-rate.service.spec.ts` | pass, gồm từ chối tỷ giá vượt band |
| `esim-ops-dashboard.spec.ts` | pass |
| `esim-usd-snapshot.spec.ts` | pass |
| `esim-order-snapshot.spec.ts` | pass |
| `esim-admin-test-order.spec.ts` | pass |
| `esim-airalo.adapter.spec.ts` | pass |
| `esim-queue-boundary.spec.ts` | pass |
| `esim-paypal-payment.spec.ts` | pass |
| `esim-sepay-payment.spec.ts` | pass |
| `payment.service.spec.ts` | pass |

Admin vitest: `esim-ops-reveal`, `esim-ops-close-claim`, `esim-admin-ops` — 15 test pass. `next build` của admin typecheck sạch.

Local: build lại image `cardon-api:local-full` và `cardon-admin:local-full`, recreate chỉ api và admin với `RUN_MIGRATIONS=false` và `RUN_SEED=false`. Worker, postgres, redis, nginx không recreate. Worker vẫn container cũ.

Trình duyệt `http://admin.localhost`, tài khoản super admin:

- Tỷ giá hiệu lực 1 USD = 25.500. Bản 27.000 vẫn PENDING_REVIEW, có Phê duyệt và Từ chối. Bản 25.000 đã có đơn hiện «Đã dùng, không sửa». Không bấm hai nút của bản 27.000.
- Danh sách đơn: `ORD-20261106-090177` charge `$4.12`, thị trường INTL, quốc gia AE. Tìm theo email khách chỉ còn đơn đó.
- Lọc báo cáo currency USD còn 1 đơn, doanh thu SUCCESS trống. Doanh thu không lọc là một dòng VND SePay 103.000, không cộng `$4.12`.
- Chi tiết đơn giữ catalog 103.000 VND, charge `$4.12`, cost 69.085 VND, FX 25.000, FX rate id `4894c690-2593-4398-ae49-5d0aac5f6884`. Payment `PAY-7AACA357AAD04772B342` PayPal `$4.12`, trạng thái EXPIRED. Không capture.
- Thanh toán lọc USD chỉ còn payment `$4.12` đó.
- Fulfillment lọc mã `ORD-20261105-C1CF25` còn một lần CREATE `PROFILE_SAVED`. Meta chỉ có mã gói và mã Airalo, không có LPA, secret hay token.
- CSV bấm trên bộ lọc email, không hiện lỗi.
- `settings.system.customerEsimEnabled` vẫn `false`.

## 7. Chưa làm và lý do

- Không quy đổi lợi nhuận USD/VND. Chưa có quy tắc tỷ giá nào được chấp nhận để tính lại đơn cũ. Đơn quốc tế hiện charge USD và cost VND nên lợi nhuận để ở nhóm không đối chiếu được.
- Không có cột người tạo tỷ giá. Người hiện trên lịch sử là người ra quyết định (`publishedBy`).
- CSV do trình duyệt ghép từ JSON, trần 1.000 dòng. Không thêm thư viện export.
- Không sửa đơn, payment hay tỷ giá đã có. Payment PayPal sandbox của `ORD-20261106-090177` đang EXPIRED; không capture lại.
- Không đụng luồng bán thẻ, nạp điện thoại, ví đại lý. Các suite payment và snapshot liên quan đều pass.

## 8. Rủi ro cần quyết định

- Lợi nhuận eSIM quốc tế sẽ tiếp tục trống cho đến khi có quy tắc đối chiếu USD charge với VND cost. Không nên lấy tỷ giá EFFECTIVE mới để điền số này.
- Bộ lọc currency của báo cáo dùng `chargeCurrency` trên đơn và `currency` trên payment. Đơn cũ không có snapshot không vào bộ lọc currency.
- Từ chối tỷ giá ghi người thực hiện vào `publishedBy`. Nhãn UI là «Người xác nhận» cho cả công bố, phê duyệt và từ chối.
- Bản 27.000 vẫn chờ người vận hành. Phase 4 không approve và không xóa.

Dừng tại Phase 4. Chờ nghiệm thu. Không triển khai production và không mở Phase 5.
