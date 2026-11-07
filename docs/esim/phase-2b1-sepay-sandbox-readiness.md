# Phase 2B.1 — SePay Sandbox readiness

Ngày: 2026-11-06. Đợt này chỉ đọc code, cấu hình và process đang chạy. Không sửa code, không đổi database, không tạo đơn, không gọi SePay, không dùng credential live.

Kết luận: **chưa sẵn sàng cho giao dịch Sandbox thực tế.** Hợp đồng trong source là PASS. Runtime đang BLOCKED vì thiếu biến, `APP_PUBLIC_URL` là loopback, và image API đang chạy chưa chứa route IPN.

## 1. Hạng mục đã kiểm tra

| Hạng mục | Kết quả | Vị trí |
| --- | --- | --- |
| A. Biến Sandbox tồn tại trên host, `.env`, `.env.local-full` và container API | FAIL | `esim-sepay-sandbox.config.ts` dòng 26–34. Bốn biến `ESIM_SEPAY_*` đều absent |
| A. Code từ chối secret có prefix `spsk_live_` | PASS | `esim-sepay-sandbox.config.ts` dòng 35–36 |
| A. Checkout URL cố định là Sandbox, không đọc URL production từ env | PASS | `esim-sepay-checkout.ts` dòng 18; config dòng 44 |
| A. Không có credential live nào được nạp cho luồng eSIM | PASS | Process host và container đều không có các biến eSIM |
| B. Chỉ tạo payment eSIM khi snapshot VND hợp lệ | PASS | `esim-sepay-payment.service.ts` dòng 72, 204–221 |
| B. `payments.amount` lấy từ `orders.charge_amount` | PASS | dòng 73 và 118 |
| B. `payments.currency = VND`, `product_lane = ESIM` | PASS | dòng 119–120 |
| B. Luồng eSIM mới không dùng `orders.total_amount` | PASS | service eSIM không đọc `totalAmount` |
| B. Đơn eSIM rời trước failover bán lẻ | PASS | `payment.service.ts` dòng 156–168, failover bắt đầu ở dòng 171 |
| B. MegaPay, SePay retail, PayPal admin-test không đi vào signer eSIM | PASS | nhánh eSIM chỉ khi mọi dòng là `ESIM`, dòng 1036–1047. PayPal admin-test trả về trước đó, dòng 156–158 |
| C. Endpoint `POST /api/v1/payments/ipn/esim/sepay` có trong source và `@Public()` | PASS | `payment.controller.ts` dòng 66–73. Prefix `api/v1` ở `main.ts` dòng 106–108 |
| C. Xác thực `X-Secret-Key`, không gọi HMAC webhook đại lý | PASS | `esim-sepay-payment.service.ts` dòng 160–162. Không gọi `verifySepayWebhookAuth` |
| C. Secret sai bị từ chối | PASS | dòng 161–162, `UnauthorizedException` |
| C. Sai amount, currency hoặc trạng thái không PAID | PASS | `esim-sepay-ipn.ts` dòng 86–106; service dòng 178–181 không gọi claim |
| C. IPN lặp không dispatch lần hai | PASS | claim dòng 258–262 trả `DUPLICATE`; dispatch chỉ sau `SETTLED`, dòng 189–199 |
| C. Hai IPN đồng thời chỉ một lần sang PAID | PASS | advisory lock dòng 252; `updateMany` PENDING rồi `WAITING_PAYMENT`, dòng 280–305 |
| C. Fulfillment sau khi transaction commit | PASS | `claimSettlement` await xong rồi mới `dispatchOrderFulfillment`, dòng 184–199 |
| D. Không lưu số thẻ, tên chủ thẻ, hạn thẻ, CVV | PASS | claim chỉ lưu `gatewayTransactionId`. Payload IPN không được ghi |
| D. Log hiện có không chứa secret | PASS | warn chỉ có mã lý do và invoice, dòng 180 và 191. Filter lỗi không ghi body khi 401 |
| D. IPN eSIM không cộng ví đại lý | PASS | service eSIM không gọi wallet, ledger hay `AgentDepositWebhookService` |
| D. Webhook đại lý giữ endpoint và HMAC | PASS | `POST payments/webhook/:gateway`, dòng 76–106, vẫn `tryHandle` rồi `verifySepayWebhookAuth` |
| D. Signer bán lẻ không đổi | PASS | `sepay.pg.ts` dòng 17–29, field đầu vẫn là `merchant` |
| E. `APP_PUBLIC_URL` để SePay Sandbox gọi tới | BLOCKED | `.env.local-full` và container API là HTTP loopback |
| E. Route IPN trên process đang chạy | BLOCKED | Container không có file service. `POST http://localhost/api/v1/payments/ipn/esim/sepay` trả 404 |
| E. Log truy vết checkout thành công và IPN `SETTLED` | FAIL | Hai đường thành công không có dòng log. Chỉ mismatch, `EXPIRED` và `LOST` được warn |
| E. Phân biệt SUCCESS, FAILED, PENDING | PASS | Enum `PaymentRecordStatus` có đủ ba trạng thái cộng `EXPIRED`. IPN hợp lệ ghi SUCCESS. Lệch tiền giữ PENDING và `settlementMismatch` |
| E. Đối soát payment với order và snapshot | PASS | `payments.order_id`, `amount`, `currency`, `product_lane`, `fx_rate_id` và cột snapshot trên `orders` |

## 2. Kết quả theo nhóm

- **A. Cấu hình:** cơ chế trong code PASS. Giá trị runtime FAIL / BLOCKED.
- **B. Checkout:** PASS trong source.
- **C. IPN:** PASS trong source. Process đang chạy chưa expose route.
- **D. Cách ly:** PASS.
- **E. Vận hành:** BLOCKED. Chưa được phép thực hiện giao dịch Sandbox.

## 3. Biến môi trường

Chỉ ghi tên. Không có giá trị secret trong báo cáo này.

| Biến | Host, `.env`, `.env.local-full` | Container `cardon-local-full-api` |
| --- | --- | --- |
| `ESIM_SEPAY_SANDBOX_ENABLED` | absent | absent |
| `ESIM_SEPAY_SANDBOX_MERCHANT_ID` | absent | absent |
| `ESIM_SEPAY_SANDBOX_MERCHANT_SECRET` | absent | absent |
| `ESIM_SEPAY_SANDBOX_IPN_SECRET` | absent | absent |
| `APP_PUBLIC_URL` | có trong `.env.local-full`, host là loopback, scheme HTTP | cùng dạng loopback HTTP |

`docker-compose.local-full.yml` dòng 45 truyền `APP_PUBLIC_URL`. Dòng 60–61 truyền `SEPAY_API_KEY` và `SEPAY_WEBHOOK_SECRET` của webhook bán lẻ / đại lý. File compose không truyền bốn biến `ESIM_SEPAY_SANDBOX_*`. Thêm vào env file thôi thì container vẫn không thấy.

## 4. File và vị trí chính

- Cấu hình và từ chối live: `src/modules/payment/providers/sepay/esim-sepay-sandbox.config.ts` dòng 23–48.
- URL và thứ tự field: `src/modules/payment/providers/sepay/esim-sepay-checkout.ts` dòng 4–18 và 38–43.
- Hợp đồng IPN: `src/modules/payment/providers/sepay/esim-sepay-ipn.ts` dòng 64–110.
- Tạo payment và claim: `src/modules/payment/services/esim-sepay-payment.service.ts` dòng 49–150 và 152–321.
- Rẽ khỏi bán lẻ: `src/modules/payment/services/payment.service.ts` dòng 156–168 và 761–767.
- Route: `src/modules/payment/controllers/payment.controller.ts` dòng 66–73 và 76–106.
- Compose: `docker-compose.local-full.yml` dòng 45, 60–61.

## 5. Việc cần xử lý trước Sandbox

1. Cấp merchant id Sandbox, merchant secret Sandbox và IPN secret riêng. Không dùng secret `spsk_live_` và không dùng chung `SEPAY_WEBHOOK_SECRET`.
2. Đặt `ESIM_SEPAY_SANDBOX_ENABLED=true` và truyền đủ bốn biến vào environment của service API. Compose local hiện chưa có các key này.
3. Đặt `APP_PUBLIC_URL` là origin HTTPS mà SePay gọi được. Giá trị loopback hiện tại không nhận return URL và không nhận IPN.
4. Build lại image API rồi mới chạy. Image đang chạy không chứa `esim-sepay-payment.service`, và route local trả 404.
5. Trên SePay Sandbox, đăng ký IPN Auth Type `SECRET_KEY` tới `https://<public-api>/api/v1/payments/ipn/esim/sepay`. Không trỏ vào `/api/v1/payments/webhook/sepay`.
6. Bổ sung log checkout và log IPN `SETTLED` với invoice, order id và outcome. Không ghi secret, form đã ký, hay dữ liệu thẻ. Đây là lỗ hổng truy vết, không phải lỗ hổng xác thực.
7. Chưa xác nhận được SePay Sandbox chấp nhận thứ tự field chính thức, vì đợt này không gọi SePay. Nếu Sandbox từ chối, dừng lại. Không sửa `signSepayPgFields`.

## 6. Checklist khi được phép giao dịch Sandbox

1. Xác nhận container API đã có file service mới và `POST /api/v1/payments/ipn/esim/sepay` không còn 404.
2. Xác nhận bốn biến eSIM present, secret không có prefix `spsk_live_`, checkout URL vẫn là `https://pay-sandbox.sepay.vn/v1/checkout/init`.
3. Tạo một đơn eSIM VND mới. Không dùng đơn admin-test cũ và không lấy `1.00` làm amount.
4. Kiểm tra payment: amount bằng `orders.charge_amount`, currency `VND`, `product_lane = ESIM`, invoice bắt đầu bằng `ESIM`.
5. Thanh toán trên trang Sandbox. Không dùng thẻ thật.
6. Chờ IPN. Không kết luận PAID từ trang success.
7. Đối soát một IPN đúng: payment SUCCESS, order PAID, một job `esim-fulfill-{orderId}`. Không gọi Airalo CREATE thật nếu môi trường chưa được phép.
8. Đối soát một IPN lệch amount: payment không SUCCESS, order không PAID, không có job mới, `settlementMismatch` được ghi.
9. Gửi lại đúng IPN đó: không có settlement lần hai và không có job thứ hai.
10. Xác nhận ví đại lý không đổi và webhook `POST /api/v1/payments/webhook/sepay` vẫn từ chối payload này.

Phase 2B.1 dừng tại đây. Không chuyển sang Phase 2C.
