# Phase 4.1 — Checkout eSIM: phương thức và giá

Ngày: 2026-11-06. Sửa cách khách thấy phương thức và số tiền trước khi tạo đơn. Không đổi PaymentService bán thẻ, webhook ví đại lý, MegaPay, PayOS, công thức giá Phase 3, signer PayPal, hay SePay agent wallet. Không bật eSIM production. Không chạy migration. Không sang Phase 5.

## 1. Luồng cũ và luồng mới

Luồng cũ:

1. Trang chi tiết gói quốc tế gắn cứng `market=INTL` và chỉ đưa khách tới PayPal.
2. Gói Việt Nam gọi tạo đơn SePay ngay trên trang chi tiết, trước khi khách thấy số tiền và phương thức.
3. Nút trên checkout eSIM lấy `pricing.totalPayment` theo VND, kể cả khi cổng đang là PayPal USD.
4. Số USD chỉ xuất hiện sau khi đã có payment.

Luồng mới:

1. Khách chọn gói. Trang chi tiết không tạo đơn và không gắn market lên URL.
2. Checkout gọi `GET /api/v1/esim/quote?variantId=`. Server suy market từ quốc gia gói, không từ ngôn ngữ giao diện.
3. Quote trả một phương thức đúng cặp market/currency, cùng số tiền, giá tham khảo và tỷ giá đã chọn.
4. Khách thấy số tiền của cổng đó rồi mới bấm xác nhận.
5. Server tạo đơn và khóa snapshot theo `paymentMethodCode` + `market` trong body. Body không có amount, currency, fxRate hay chargeAmount.
6. Server tạo payment với `{ orderId, gateway }`. Số tiền lấy từ snapshot đơn, không từ trình duyệt.
7. PayPal chỉ điều hướng khi URL là approval URL của PayPal. Quay về success URL không tự đánh dấu PAID.

Đơn đã tạo không bị đổi `charge_currency` hay `charge_amount` khi khách muốn cổng khác. Muốn cổng khác thì phải là đơn mới, và chỉ khi quote của gói đó hỗ trợ cặp đó.

## 2. Phương thức và currency

Một gói chỉ có một cặp. Ngôn ngữ không chọn currency.

| Market | Cổng | Currency | Khi bị ẩn |
| --- | --- | --- | --- |
| VN | SePay Payment Gateway | VND | Merchant hoặc secret của Payment Gateway chưa có. Không dùng secret VietQR ví đại lý. |
| INTL | PayPal eSIM | USD | PayPal chưa sẵn sàng, hoặc không khóa được tỷ giá EFFECTIVE. |

SePay không hiện trên gói INTL. PayPal không hiện trên gói VN. Thêm cả hai cho cùng một gói sẽ phải sửa snapshot đã chốt ở Phase 3: VN khóa VND, INTL khóa USD. Phase này không làm việc đó.

Quote công khai không nhận amount, currency hay FX từ client. Nếu PayPal hoặc tỷ giá không dùng được, API trả 200 với `paymentOptions: []` và `unavailableReason` là `PAYPAL_UNAVAILABLE` hoặc `FX_UNAVAILABLE`, không trả 400. Gói VN thiếu SePay thì `SEPAY_UNAVAILABLE`.

Gói UAE đang publish, variant `1bb9f03b-46e3-43c6-a9df-79d0c902eafd`, quote lúc nghiệm thu:

- market `INTL`
- catalog `103000` VND
- một option PayPal `4.04` USD
- tỷ giá `25500`, rate id `3fc6e39c-692d-4223-9b4e-e8b7f8906a92`
- không có SePay

Catalog local không có gói VN đang `PUBLISHED`, nên màn SePay VND chưa chụp được trên storefront. Cặp VN + SePay được khóa bằng unit test.

Nhãn:

| | Tiếng Việt | Tiếng Anh |
| --- | --- | --- |
| SePay | Thanh toán 180.000 ₫ | Pay 180,000 VND |
| PayPal | Thanh toán $7.06 USD | Pay $7.06 USD |
| Ghi chú USD | Giá tham khảo … ₫ · Tỷ giá 1 USD = … VND | Reference price … VND · Exchange rate 1 USD = … VND |

Số trên nhãn lấy từ option của API. SePay không hiện tỷ giá.

## 3. Snapshot

`GET /esim/quote` chỉ đọc tỷ giá EFFECTIVE và tính số USD để hiển thị. Quote không ghi snapshot và không sửa tỷ giá.

Snapshot ghi khi `create()` đơn, trong transaction hiện có. INTL vẫn `lockIntlUsdPrice` bằng tỷ giá EFFECTIVE tại lúc tạo. VN vẫn charge VND. Đơn cũ không bị tính lại bằng tỷ giá hiện tại. `orders.total_amount` vẫn là VND catalog và không được gửi sang PayPal.

Đổi ý trước khi tạo đơn chỉ đổi option đang chọn trên UI. Vì mỗi market chỉ có một option hợp lệ, không có nhánh nào ghi đè snapshot của đơn đã tồn tại.

Retry payment giữ idempotency đơn eSIM hiện có. Không thêm payment mới cho cùng một lần chờ thanh toán.

## 4. API và file

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/api/v1/esim/quote?variantId=` | Thêm `paymentOptions`, `unavailableReason`. Các field catalog/charge/fx cũ giữ nguyên cho client cũ. |
| POST | `/api/v1/orders` | eSIM gửi items, `paymentMethodCode`, `market`, `locale`. Không gửi số tiền. |
| POST | `/api/v1/payments` | eSIM gửi `orderId` và `gateway` của option đã quote. |

| File | Việc |
| --- | --- |
| `src/modules/esim/esim-checkout-options.ts` | Chọn đúng một cặp gateway/currency |
| `src/modules/esim/esim-checkout-options.spec.ts` | VN chỉ SePay, INTL chỉ PayPal, cổng tắt bị loại, không bịa USD |
| `src/modules/esim/esim-order.service.ts` | `quote()` ghép option. SePay đọc Payment Gateway. PayPal đọc config eSIM. `create()` không đổi. |
| `apps/web/lib/esim-checkout-options.ts` | Nhãn, ghi chú tỷ giá, body tạo đơn |
| `apps/web/lib/esim-checkout-options.test.ts` | Hai ngôn ngữ, CTA đúng currency, body không có amount/currency/fx |
| `apps/web/lib/i18n/journey-messages.ts` | Chuỗi trạng thái checkout eSIM |
| `apps/web/components/esim/EsimDetailClient.tsx` | Nút mua chỉ mở `/checkout?variantId=` |
| `apps/web/app/checkout/CheckoutPageClient.tsx` | Layout eSIM hai cột. Thẻ và nạp cước vẫn một cột, vẫn lọc PayPal ra khỏi phương thức thẻ. |

Không có file migration.

## 5. Giao diện

Desktop: hai cột trong `max-w-5xl`. Trái là gói, quốc gia, dung lượng, thời hạn, số lượng, giá tham khảo. Phải là phương thức, số tiền, tỷ giá nếu là USD, thông báo chưa mở bán, và nút xác nhận.

Mobile, 390px: một cột. Gói ở trên, phương thức ở giữa, nút ở cuối thẻ thanh toán. Nút `sticky` phía trên thanh điều hướng đáy (`bottom: 4.5rem`), cao 48px. Không đè chữ thông báo và không tràn ngang (`scrollWidth` bằng `clientWidth`).

Trạng thái có chữ riêng: đang tải quote, không có phương thức, đang tạo đơn, đang tạo payment, payment thất bại, đơn hết hạn, lỗi kết nối. Chưa mở bán thì nút disabled và hiện `EsimSalesOffNotice`. Thành công và đơn hết hạn vẫn đi qua các trang checkout hiện có; phiên này không bấm thanh toán nên không tạo payment mới.

Ảnh:

- `docs/esim/phase-4.1-checkout-desktop-en.png`
- `docs/esim/phase-4.1-checkout-desktop-vi.png`
- `docs/esim/phase-4.1-checkout-mobile-en.png`
- `docs/esim/phase-4.1-checkout-mobile-vi.png`

Trên cả hai ngôn ngữ, gói UAE hiện `Pay $4.04 USD` hoặc `Thanh toán $4.04 USD`, giá tham khảo 103.000 VND và tỷ giá 1 USD = 25.500 VND. Không có SePay.

## 6. Kiểm thử

Đã chạy lại sau khi sửa checkout:

- `esim-checkout-options.spec.ts`, `esim-order-idempotency.spec.ts`, `payment.service.spec.ts`: 30 tests. PaymentService dùng chung không đổi.
- `esim-usd-snapshot.spec.ts`, `esim-market.rules.spec.ts`: 12 tests.
- `esim-paypal-payment.spec.ts`, `esim-sepay-payment.spec.ts`: 32 tests. IPN SePay và webhook PayPal vẫn từ chối sai amount, sai currency và payment hết hạn.
- `apps/web` vitest `esim-checkout-options.test.ts` và `esim-paypal.test.ts`: 7 tests.

Next build của image `cardon-web:local-full` typecheck xong. API và web local đã recreate với image mới. Worker không recreate, vẫn Up 27 giờ. Postgres, redis, nginx, admin không recreate cho lần sửa nút mobile.

Storefront, đã đăng nhập, không bấm thanh toán:

- Quote UAE như mục 2.
- Desktop 1920px: hai cột `575px` và `425px`, không tràn ngang.
- Mobile 390px: không tràn ngang. Nút USD nằm dưới thông báo chưa mở bán và trên thanh điều hướng.
- Đổi VI/EN chỉ đổi nhãn. Currency trên nút vẫn USD.
- Trang thẻ điện thoại vẫn là màn chọn mệnh giá VND, không bị chuyển sang layout eSIM.

Không mở PayPal Sandbox và không gọi capture. Payment `PAY-7AACA357AAD04772B342` của đơn `ORD-20261106-090177` vẫn để nguyên. Không đánh dấu PAID từ URL success.

## 7. Dữ liệu local giữ nguyên

- Tỷ giá 27.000 vẫn `PENDING_REVIEW`. Tỷ giá hiệu lực vẫn 25.500. Không bấm phê duyệt hoặc từ chối.
- `customerEsimEnabled` được trả về `false`. Một lần lưu `settings.system` lúc 16:47 UTC đã bật cờ này từ `false` lên `true`. Phase này chỉ gửi lại field đó là `false`. Các field system khác giữ giá trị đang lưu.
- `salesOpen` sau đó là `false`. Nút thanh toán trên checkout bị disabled.
- Không xóa dữ liệu sandbox. Không sửa đơn hoặc payment cũ.

## 8. Việc còn lại

- Catalog local không có gói VN publish, nên chưa chụp được checkout SePay VND trên trình duyệt. Rule và nhãn SePay nằm ở unit test.
- Một gói không hiện đồng thời SePay và PayPal. Đó là hệ quả của snapshot VN/INTL đã nghiệm thu, không phải cổng bị thiếu cấu hình.
- Dòng tỷ giá trên cột hẹp xuống dòng giữa `1 USD =` và số VND. Số vẫn lấy từ API.
- Footer và một số nhãn chrome tiếng Anh vẫn trộn tiếng Việt. Đó là nội dung site có sẵn, không thuộc checkout eSIM.
- Chưa bấm luồng PayPal Sandbox Buyer vì cửa bán đang tắt và không tạo payment mới trong phiên này.

Dừng tại Phase 4.1. Không bắt đầu Phase 5.
