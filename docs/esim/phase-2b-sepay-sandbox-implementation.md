# Phase 2B — SePay Payment Gateway và IPN riêng cho eSIM (Sandbox)

Ngày: 2026-11-06. Phạm vi dừng tại Sandbox eSIM VND. Không triển khai Phase 2C, FX, PayPal USD, production gateway, hay giao dịch tiền thật.

## 1. Kiến trúc và luồng

Trước Phase 2B, `PaymentService.createPayment` ghi `payments.amount` từ `orders.total_amount`. Đơn eSIM đi chung nhánh bán lẻ, kể cả failover MegaPay → SePay, và signer checkout dùng thứ tự field của bán lẻ. Webhook `POST /api/v1/payments/webhook/sepay` vừa nhận nạp ví đại lý vừa nhận thanh toán bán lẻ.

Sau Phase 2B:

1. Đơn chỉ chứa biến thể eSIM, và không phải PayPal admin-test, rời `createPayment` trước khi gán amount và trước failover.
2. `EsimSepayPaymentService` chỉ tạo payment khi snapshot VND hợp lệ. Amount lấy từ `orders.charge_amount`.
3. Checkout là form POST tới đúng host Sandbox, ký bằng signer riêng theo thứ tự field tài liệu SePay.
4. IPN vào `POST /api/v1/payments/ipn/esim/sepay`. Handler này không gọi `AgentDepositWebhookService` và không cộng ví.
5. Settlement eSIM khóa theo order, claim `PENDING → SUCCESS`, rồi `WAITING_PAYMENT → PAID` trong cùng transaction. Fulfillment chỉ được dispatch sau khi transaction commit.
6. `syncFromGateway` với payment `product_lane = ESIM` và gateway SePay chỉ trả trạng thái hiện tại. Trang success/cancel không làm đơn PAID.

Nhánh bán lẻ, `signSepayPgFields`, `verifySepayWebhookAuth`, webhook đại lý, PayPal admin-test và `markPaidInTransaction` giữ hành vi cũ. PayPal khách của eSIM không còn đi vào nhánh gán `total_amount` với nhãn USD; nhánh đó bị từ chối vì Phase 2C chưa mở.

## 2. File thay đổi

Thêm:

- `src/modules/payment/providers/sepay/esim-sepay-checkout.ts`
- `src/modules/payment/providers/sepay/esim-sepay-sandbox.config.ts`
- `src/modules/payment/providers/sepay/esim-sepay-ipn.ts`
- `src/modules/payment/services/esim-sepay-payment.service.ts`
- `src/modules/payment/esim-sepay-payment.spec.ts`

Sửa trong phạm vi 2B:

- `src/modules/payment/services/payment.service.ts` — rẽ đơn eSIM trước amount/failover; sync eSIM SePay không đánh dấu PAID và không dispatch.
- `src/modules/payment/controllers/payment.controller.ts` — thêm endpoint IPN. Thân `webhook/:gateway` không đổi.
- `src/modules/payment/payment.module.ts` — đăng ký service mới.
- `prisma/schema.prisma` — chỉ sửa chú thích cột `payments.currency`. Không có migration mới.

Không sửa `sepay.auth.ts`, `signSepayPgFields`, `AgentDepositWebhookService`, `AgentDepositService`, worker Airalo, hay `open_guard`.

## 3. Endpoint

Tạo payment vẫn là `POST /api/v1/payments` với `Idempotency-Key`. Đơn eSIM nhận `checkoutUrl` và `checkoutFormFields` để trình duyệt POST form. Checkout URL cố định:

`https://pay-sandbox.sepay.vn/v1/checkout/init`

IPN:

`POST /api/v1/payments/ipn/esim/sepay`

Webhook đại lý giữ nguyên:

`POST /api/v1/payments/webhook/sepay`

Invoice eSIM có prefix `ESIM`, không dùng mã `DH` của nạp ví. Nếu IPN eSIM bị gửi nhầm vào webhook đại lý, mã này không khớp bản ghi nạp ví nên không cộng ví và không làm đơn eSIM PAID.

## 4. Cấu hình Sandbox

Chưa có credential Sandbox trong môi trường hiện tại. Checkout fail closed khi thiếu bất kỳ biến nào dưới đây. Không hardcode secret, không ghi secret ra log, không trả secret trong API.

| Biến | Ý nghĩa |
| --- | --- |
| `ESIM_SEPAY_SANDBOX_ENABLED` | Phải đúng `true` |
| `ESIM_SEPAY_SANDBOX_MERCHANT_ID` | Merchant Sandbox |
| `ESIM_SEPAY_SANDBOX_MERCHANT_SECRET` | Merchant secret Sandbox. Giá trị bắt đầu bằng `spsk_live_` bị từ chối |
| `ESIM_SEPAY_SANDBOX_IPN_SECRET` | Secret đối chiếu header `X-Secret-Key`. Không dùng chung secret HMAC webhook đại lý |
| `APP_PUBLIC_URL` | Origin của trang success, error, cancel. Các trang này không phải bằng chứng thanh toán |

Đăng ký IPN trên SePay Sandbox với Auth Type `SECRET_KEY`, trỏ tới URL HTTPS công khai của endpoint ở mục 3. Localhost không nhận được IPN từ SePay. Không điền secret production và không trỏ checkout sang `https://pay.sepay.vn`.

## 5. Snapshot và amount

Điều kiện tạo payment eSIM SePay:

- Mọi dòng đơn là eSIM.
- `catalog_currency = VND`, `catalog_amount` có giá trị.
- `charge_currency = VND`, `charge_amount` là số nguyên đồng và lớn hơn 0.
- Gateway yêu cầu là SePay.

`payments.amount` bằng `orders.charge_amount`. `payments.currency` là `VND`. `payments.product_lane` là `ESIM`. `payments.fx_rate_id` chỉ được chép từ snapshot nếu đã có; Phase 2B không tạo FX rate. Snapshot thiếu, charge không phải VND, hoặc amount có phần thập phân thì từ chối. Không fallback sang `orders.total_amount`, không lấy giá từ frontend, không ghi đè snapshot. Payment gắn `order_id` của đúng đơn.

Admin-test giữ hai số cũ: `orders.total_amount = 103000` là giá trị đơn, `clientTrace.adminTestCharge.amount = 1.00` là khoản PayPal thử nghiệm. SePay không dùng `1.00` làm snapshot. Dòng admin-test cũ không bị sửa.

## 6. Xác thực IPN

Chỉ chấp nhận khi tất cả điều kiện sau đúng:

- `X-Secret-Key` khớp `ESIM_SEPAY_SANDBOX_IPN_SECRET`.
- Invoice khớp `payments.payment_reference` của payment SePay có `product_lane = ESIM`.
- `notification_type = ORDER_PAID`.
- `order.order_status = CAPTURED`.
- `transaction.transaction_status = APPROVED`.
- Currency của order và transaction đều là `VND`.
- `order_amount` và `transaction_amount` đều khớp `payments.amount`.
- Có provider transaction id.

Secret sai trả 401. Chữ ký đúng nhưng amount, currency, hoặc trạng thái sai thì không SUCCESS, không PAID, không dispatch. Hệ thống ghi `settlementMismatch` trên payment còn `PENDING` và log mã lý do cùng invoice. Log không chứa secret, số thẻ, tên chủ thẻ, hạn thẻ, hay CVV. Payment bán lẻ hoặc invoice lạ không bị cập nhật.

IPN đã ghi nhận hoặc bị lệch trả HTTP 200 để SePay không gửi lại vô hạn. Secret sai không trả 200.

## 7. Chống trùng và concurrency

Trong một transaction:

1. `pg_advisory_xact_lock` theo order id.
2. Payment đã `SUCCESS` với cùng provider transaction id thì kết thúc là trùng, không dispatch lần hai.
3. Order không còn `WAITING_PAYMENT`, hoặc payment/order đã hết hạn, thì không SUCCESS và không dispatch.
4. `UPDATE payments ... WHERE status = PENDING AND product_lane = ESIM`. Số dòng khác 1 thì dừng.
5. `UPDATE orders ... WHERE payment_status = WAITING_PAYMENT`. Số dòng khác 1 thì rollback luôn claim payment.
6. Giao dịch tài chính B2C đang `PENDING` hoặc `FAILED` được chuyển `COMPLETED` trong cùng transaction.

Index `payments_one_open_esim` từ Phase 1 vẫn chặn hai payment eSIM cùng `PENDING` hoặc `SUCCESS` trên một đơn. Hai IPN cùng payment chỉ một lần SETTLED. Payment thứ hai sau khi đơn đã PAID không được SUCCESS. `markPaidInTransaction`, PayPal sync và manual review bán lẻ không dùng nhánh claim này.

## 8. Dispatch fulfillment

`dispatchOrderFulfillment` chỉ chạy sau khi claim trả `SETTLED` và transaction đã commit. Retry IPN trả `DUPLICATE` và không tạo job mới. Job id `esim-fulfill-{orderId}`, `attempts: 1`, và `open_guard` không đổi. Test IPN mock dispatch, không gọi Airalo CREATE. Admin-test vẫn bị fulfillment dispatch bỏ qua như cũ.

## 9. Kết quả test

Chạy ngày 2026-11-06 trên host, mock và stub. Không có fail.

Nhóm A–D nằm trong `src/modules/payment/esim-sepay-payment.spec.ts`: 1 suite, 19 test, 19 pass. Bao gồm snapshot, từ chối snapshot thiếu hoặc không phải VND, signer đúng thứ tự tài liệu, signer bán lẻ không đổi, secret thiếu hoặc secret live bị từ chối, IPN hợp lệ, secret sai, invoice sai, amount sai, currency sai, trạng thái sai, redirect/sync không PAID, IPN lặp, hai IPN đồng thời, payment thứ hai, IPN sau PAID, IPN sau hết hạn, IPN cạnh sync, và một lần dispatch.

Regression, tất cả pass:

| Suite | Test |
| --- | ---: |
| `payment.service.spec.ts` | 17 |
| `payment.sepay-webhook.spec.ts` | 5 |
| `payment.final-audit.spec.ts` | 14 |
| `payment.audit.spec.ts` | 10 |
| `sepay.pg.spec.ts` | 5 |
| `sepay.provider.spec.ts` | 18 |
| `megapay.provider.spec.ts` | 11 |
| `megapay-pg.spec.ts` | 3 |
| `paypal.checkout.spec.ts` | 30 |
| `paypal-admin-test-payment.spec.ts` | 18 |
| `agent-deposit-webhook.service.spec.ts` | 4 |
| `deposit-reference.generator.spec.ts` | 2 |
| `agent.service.spec.ts` | 13 |
| `agent-api.money-audit.spec.ts` | 15 |
| `esim-order-snapshot.spec.ts` | 1 |
| `esim-order-idempotency.spec.ts` | 9 |
| `esim-admin-test-order.spec.ts` | 21 |
| `esim.phase-a.spec.ts` | 67 |
| `esim-queue-boundary.spec.ts` | 4 |
| `esim-first-create-claim.spec.ts` | 37 |
| `order.service.spec.ts` | 32 |
| `provider/topup.service.spec.ts` và `topup-phone.util.spec.ts` | 10 |

Tổng các suite trên, gồm suite mới: 24 suite, 365 test, 0 fail.

## 10. Regression bán lẻ, ví đại lý và PayPal

`payment.service.spec.ts` vẫn tạo payment thẻ từ `total_amount` vì đơn test không phải eSIM. Webhook SePay bán lẻ, MegaPay, failover `preferLegacyQr`, và audit payment đều pass. Webhook nạp ví và đối chiếu tiền ví/ledger pass; IPN eSIM không đi qua các service đó. PayPal checkout và PayPal admin-test pass. Công thức amount PayPal hiện hữu không đổi. Đơn admin-test PayPal vẫn trả về trước nhánh eSIM SePay.

## 11. Chưa kiểm chứng được

Không có merchant id hoặc secret Sandbox trong process env, `.env`, hay `.env.local-full`. Vì vậy chưa gọi checkout Sandbox thật, chưa nhận IPN thật, và chưa xác nhận SePay Sandbox chấp nhận thứ tự field chính thức. Không tuyên bố end-to-end Sandbox thành công. Không dùng thẻ thật và không gọi Airalo CREATE thật.

## 12. Việc còn lại trước nghiệm thu

1. Vận hành cấp bốn biến Sandbox ở mục 4, kèm `APP_PUBLIC_URL` HTTPS.
2. Đăng ký IPN Auth Type `SECRET_KEY` đúng endpoint eSIM, không trỏ vào webhook đại lý.
3. Tạo một đơn eSIM VND mới, thanh toán Sandbox, đối chiếu amount snapshot và một IPN lệch amount.
4. Nếu Sandbox từ chối thứ tự field chính thức, dừng và báo cáo. Không sửa signer bán lẻ để né lỗi đó.
5. Chưa bật production, chưa làm Phase 2C PayPal USD, chưa phát hành FX, chưa backfill dữ liệu cũ.

Phase 2B dừng tại đây để chờ nghiệm thu.
