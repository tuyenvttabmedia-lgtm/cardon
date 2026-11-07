# Phase 2C — PayPal USD cho eSIM

Ngày: 2026-11-06. Triển khai theo audit `docs/esim/phase-2c1-paypal-usd-readiness-audit.md` và các quyết định đã chốt. Không sửa `buildEsimVndPriceSnapshot`. Không migration. Không backfill. Không đổi SePay eSIM, admin-test amount, VietQR, ví đại lý hay MegaPay. Không bật cổng production.

## 1. File đã thêm và sửa

| File | Việc |
| --- | --- |
| `src/modules/payment/services/esim-paypal-payment.service.ts` | Service PayPal eSIM: tạo order, webhook, sync, settlement |
| `src/modules/payment/providers/paypal/esim-paypal-snapshot.rules.ts` | Cổng snapshot USD và hạn FX, không quy đổi |
| `src/modules/payment/esim-paypal-payment.spec.ts` | Test tạo order, từ chối, webhook, đồng thời, rollback |
| `src/modules/payment/services/payment.service.ts` | Rẽ eSIM PayPal sau admin-test, trước SePay. Webhook lane ESIM không vào `markPaidInTransaction` |
| `src/modules/payment/providers/paypal/paypal.rules.ts` | Capture webhook admin-test phải khớp USD, amount và PayPal Order ID |
| `src/modules/payment/payment.module.ts` | Đăng ký service |

Không sửa `esim-sepay-payment.service.ts`, `esim-order-snapshot.ts`, schema, `.env`, hay cấu hình PayPal sandbox đã lưu.

## 2. Luồng trước và sau

Trước: admin-test tạo PayPal từ `clientTrace.adminTestCharge.amount`. Mọi đơn eSIM còn lại đi SePay và bị từ chối nếu gateway là PayPal. Nhánh bán lẻ còn lại có thể gửi `orders.total_amount` với nhãn USD.

Sau, `PaymentService.createPayment`:

1. Admin-test PayPal vẫn return trước (`payment.service.ts` dòng 166–168). Amount vẫn là `adminTestCharge.amount`.
2. Đơn chỉ gồm item eSIM và gateway PayPal đi `EsimPaypalPaymentService.createFromSnapshot` (dòng 169–178).
3. Đơn eSIM còn lại vẫn đi `EsimSepayPaymentService` (dòng 180).
4. Thẻ, nạp cước và failover MegaPay không vào hai nhánh trên.

Service chỉ gọi PayPal khi snapshot đã có trên đơn:

- `charge_currency = USD`
- `charge_amount > 0` và không quá 2 chữ số thập phân
- `fx_rate_id`, `fx_rate`, `fx_as_of` có giá trị
- Dòng `fx_rates` còn `EFFECTIVE`, `effective_to` chưa tới, và `now - observed_at <= max_staleness_seconds`

Thiếu snapshot, sai currency, amount 0 hoặc dài hơn 2 số lẻ, rate không còn hiệu lực: từ chối trước khi gọi PayPal. Amount gửi đi là `charge_amount`. Currency là USD. Không đọc `total_amount` và không đọc số tiền từ frontend.

Payment ghi `amount`, `currency = USD`, `product_lane = ESIM`, `fx_rate_id`. PayPal Order ID nằm trong `gateway_response.paypalOrderId`. Payment được commit trước HTTP. Retry dùng cùng payment reference làm PayPal-Request-Id và không tạo payment thứ hai. Order đã có PayPal Order ID thì trả lại URL đó dù FX sau đó hết hạn. Payment chưa có order id thì phải qua cổng FX lần nữa.

## 3. Idempotency và settlement

Webhook vẫn xác minh chữ ký ở `PaymentService.handleWebhook` trước khi vào lane. Chữ ký sai thì 401, service eSIM không được gọi.

Lane `product_lane = ESIM` và gateway PayPal (`payment.service.ts` dòng 588) vào `handleVerifiedWebhook`. Lane khác bị bỏ qua. Hàm này không gọi `markPaidInTransaction`.

Capture chỉ PAID khi cùng lúc:

- PayPal Order ID trong webhook trùng id đã lưu
- capture id có mặt và chưa gắn payment khác
- currency là USD trên cả payment và capture
- amount khớp `payments.amount`

Lệch thì ghi `settlementMismatch` và không PAID.

Settlement nằm trong một transaction, khóa `pg_advisory_xact_lock` theo order id:

- `payments` chỉ chuyển `PENDING → SUCCESS` bằng `updateMany`
- `orders` chỉ chuyển `WAITING_PAYMENT → PAID` bằng `updateMany`
- Giao dịch tài chính B2C checkout, nếu có, chuyển sang `COMPLETED`
- Nếu order không còn `WAITING_PAYMENT`, transaction rollback và payment không giữ SUCCESS

Hai webhook đồng thời: một `SETTLED`, một `DUPLICATE`. Fulfillment chỉ được đánh dấu sau khi transaction settlement đã commit. Cờ `fulfillmentQueued` được ghi trong transaction riêng trước khi enqueue. Job id vẫn là `esim-fulfill-{orderId}`. Webhook lặp thấy cờ đó thì không enqueue lần nữa.

Capture đã thành công mà transaction PAID rollback: payment về `PENDING`, `gateway_response.reconciliationRequired = true`, lý do `CAPTURED_UNSETTLED`. Lần sau đọc order PayPal, không gọi capture lần hai, không refund.

Admin-test không đi lane này vì payment không có `product_lane`. Capture webhook của đường đó, từ `paypal.rules.ts` `evaluatePaypalWebhookIdentity`, phải khớp USD, amount của payment và PayPal Order ID đã lưu. Amount admin-test không đổi. Admin-test vẫn không enqueue.

Đồng bộ return URL của payment eSIM PayPal gọi `EsimPaypalPaymentService.sync`. eSIM SePay vẫn trả `synced: false` và không query PayPal.

## 4. Kết quả test

| Nhóm | Kết quả |
| --- | --- |
| `esim-paypal-payment.spec.ts` | PASS |
| `paypal-admin-test-payment.spec.ts` | PASS |
| `paypal.checkout.spec.ts` | PASS |
| `paypal-admin.spec.ts` | PASS |
| `paypal-limits.rules.spec.ts` | PASS, 3 tests |
| `esim-sepay-payment.spec.ts` | PASS |
| `payment.service.spec.ts` | PASS |
| `payment.sepay-webhook.spec.ts` | PASS |
| `production-env.rules.spec.ts` | PASS |
| `apps/web/lib/esim-paypal.test.ts` | PASS, 3 tests |

Tám suite Jest payment/PayPal/SePay/production-env cộng spec mới: 112 tests PASS. Spec limit chạy riêng: 3 PASS.

Các case bắt buộc nằm trong spec mới: snapshot USD tạo order, VND bị từ chối, thiếu snapshot, FX hết hạn, amount 0, không dùng `total_amount`, chữ ký sai, sai currency, sai amount, sai order id, webhook lặp, hai webhook đồng thời, fulfillment sau commit, rollback không capture lần hai, admin-test order id lệch không PAID, SePay và retail không bị gọi chéo.

## 5. Sandbox

Local API image `cardon-api:local-full` được build lại và recreate với `RUN_MIGRATIONS=false`, `RUN_SEED=false`. Postgres, Redis, nginx và worker không recreate. Production không đụng.

Probe tạm trên database local, không phải đơn khách:

- Một dòng `fx_rate_sources` / `fx_rates` `EFFECTIVE`, `max_staleness_seconds = 86400`. Số rate chỉ để dòng FX hợp lệ. Service không dùng số đó để tính tiền.
- Đơn `total_amount = 103000.00`, `charge_currency = USD`, `charge_amount = 1.00`.
- `POST /api/v1/payments` gateway PayPal.

Kết quả HTTP 201:

- `amount = 1.00`
- `gateway = PAYPAL`
- `payment_reference = PAY-023BF5F4BA084DF5A43E`
- Host approval là `www.sandbox.paypal.com`
- PayPal Order ID `2D9713860U722073E`
- Một payment, `currency = USD`, `product_lane = ESIM`
- Request idempotency key thứ hai trả cùng reference, không tạo payment thứ hai
- `amount` không bằng 103000

Sau probe, đơn, payment, order item và hai dòng FX probe đã xóa. `fx_rates` và `fx_rate_sources` trở lại 0. Payment PayPal `EXPIRED` có từ trước vẫn còn một dòng.

Chưa capture sandbox bằng tài khoản buyer. Capture và webhook chữ ký thật cần người mua approve trên PayPal. Phần đó được chứng minh bằng unit test, chưa bằng capture sandbox end-to-end.

Env container sau recreate: `RUN_MIGRATIONS=false`, `RUN_SEED=false`, `PAYPAL_MODE=sandbox`, `PAYPAL_ESIM_ENABLED=false`. Cờ hiệu lực checkout vẫn là `esimEnabled` trong database, đã là `true` từ trước phase này. Không sửa bản ghi đó. `production-env.rules` vẫn từ chối bật cờ này trên production.

## 6. Migration

Không có migration. Cột snapshot và index `payments_one_open_esim` đã đủ. Không backfill đơn cũ.

## 7. Chưa hoàn thành

- Chưa có code ghi snapshot USD lúc tạo đơn. `buildEsimVndPriceSnapshot` vẫn ghi VND. Đơn eSIM tạo từ checkout hiện tại vẫn bị service PayPal từ chối cho đến Phase 3.
- Chưa capture và chưa nhận webhook sandbox từ một buyer thật.
- Worker local không được build lại. Job fulfillment không đổi shape. API local đã chạy code Phase 2C.
- Production không được triển khai và không được bật.

Dừng tại Phase 2C. Không sang Phase 3.
