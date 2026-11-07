# Review thiết kế Multi-Currency eSIM

## Bổ sung sau quyết định hai tích hợp SePay

Ngày rà soát: 2026-11-06. Chỉ sửa hai file tài liệu. Không sửa code, schema, database hay credential.

### Quyết định đã ghi vào thiết kế

- SePay Webhook biến động số dư giữ nguyên cho nạp ví đại lý, gồm HMAC-SHA256 hiện có trong `verifySepayWebhookAuth`. Không đổi endpoint `POST /api/v1/payments/webhook/sepay`, payload, xác thực, wallet, ledger hay deposit.
- eSIM VND dùng SePay Payment Gateway và IPN trên endpoint mới `POST /api/v1/payments/ipn/esim/sepay`. Không dùng IPN này để cộng ví.
- PayPal vẫn là đường USD của eSIM, với snapshot. Không suy currency từ tên gateway.
- QR, NAPAS và thẻ là method trên gateway. NAPAS và thẻ tắt đến khi SePay xác nhận quyền merchant. Không lưu số thẻ, hạn thẻ, tên in trên thẻ hay CVV.
- Tỷ giá đầu vào bằng tay. 1 USD = X VND. Band 2% đã chốt. Rate đầu publish tay. Hết hạn tính từ `observed_at` và chỉ chặn đơn PayPal mới.
- Market là field của gói, không suy từ ngôn ngữ, IP hay payment method.
- Đồng bộ gói Airalo mục tiêu 60 phút. Code hiện chờ 55 phút và chỉ khi live-armed. Đổi số phút không thuộc Phase 1.

### Ranh giới đã xác minh trong code

Webhook đại lý và webhook bán lẻ đang dùng chung URL SePay. Phân nhánh bằng cách tìm reference nạp trong database. Vì vậy IPN eSIM không được cắm thêm vào handler đó. Signer `signSepayPgFields` đang ký khác thứ tự field trên trang tài liệu SePay. Signer bán lẻ không được sửa để làm cho eSIM khớp tài liệu. eSIM có signer riêng.

### Tài liệu SePay

Đã đọc trang form checkout, trang IPN và trang luồng trên `developer.sepay.vn`. Chữ ký form là HMAC-SHA256. Xác thực IPN trong trang đó là `X-Secret-Key` khi Auth Type bằng `SECRET_KEY`. Trang không mô tả HMAC cho IPN. Form ghi chỉ hỗ trợ VND. Ví dụ IPN có `ORDER_PAID`, `CAPTURED`, `APPROVED` và currency VND. Trang success không được dùng làm bằng chứng.

Chưa xác nhận bởi SePay: quyền NAPAS và Visa của merchant Cardon, các Auth Type IPN ngoài `SECRET_KEY`, field amount nào được ưu tiên nếu `order_amount` khác `transaction_amount`, và việc sandbox có chấp nhận đúng thứ tự field của trang tài liệu hay không. Quy tắc an toàn trong thiết kế là không PAID khi hai amount hoặc hai currency không khớp snapshot.

### Nhất quán

Các câu cũ để khách tự chọn market, hoặc để band và chiều tỷ giá ở trạng thái chờ, đã được đánh dấu là bị mục 15 của file kiến trúc thay thế. Đoạn 2B của audit vẫn không được dùng vì nó default currency VND cho cả PayPal.

Không còn blocker kiến trúc cho Phase 1. Phase 1 chỉ thêm cột nullable, bảng FX rỗng và snapshot VND trên đơn eSIM mới, không gọi SePay và không backfill PayPal. Phase 2 trở đi không gộp vào đợt triển khai đầu.

### Phase tiếp theo

Bắt đầu Phase 1 sau khi chủ sản phẩm xem báo cáo này. Điều kiện nghiệm thu Phase 1: đơn thẻ, nạp, MegaPay, failover và một webhook nạp đại lý thử vẫn đi đường cũ. Đơn eSIM SePay mới có snapshot VND bằng `total_amount`. Không có payment production mới từ endpoint IPN eSIM vì endpoint đó chưa được triển khai ở phase này.

# Phần review trước quyết định SePay song song

Phạm vi: đọc `docs/esim/multi-currency-architecture-design.md`, `docs/esim/multi-currency-flow-audit.md`, và các đường code mà thiết kế dựa vào. Không sửa code, schema, migration, database, Docker, và không gọi cổng thanh toán.

Nhãn:

| Nhãn | Nghĩa |
| --- | --- |
| Đã xác minh | Có trong code hoặc schema hiện tại |
| Đã thiết kế | Có trong tài liệu thiết kế, chưa có trong hệ thống |
| Chưa xác minh | Thiếu dữ liệu hoặc quyền truy cập |
| Cần quyết định | Chủ sản phẩm phải chốt |

Sau review, các lỗ hổng thiết kế đã được viết lại trong chính file kiến trúc. File này là biên bản. Không có hạng mục nào dưới đây đã được triển khai.

## Kết luận

Thiết kế đủ để đưa ra duyệt, với điều kiện chủ sản phẩm chấp nhận các quyết định còn mở và implementation đi theo bản đã sửa, không theo đoạn 2B của audit.

Đoạn 2B của audit đề xuất `catalog_currency` và `payments.currency` default `VND`, kể cả nguy cơ gán nhầm PayPal. Bản thiết kế mục 4 và 9 đã bỏ default đó: cột nullable, PayPal không backfill. Bản thiết kế là bản để duyệt. Đoạn 2B của audit chỉ còn giá trị lịch sử.

## A. Payment isolation

| Điểm | Nhãn | Kết quả |
| --- | --- | --- |
| eSIM có orchestration riêng `EsimPricingService`, `EsimPaymentEligibility`, `EsimPaymentService`, `claimEsimPaid` | Đã thiết kế | Đạt nếu implementation tuân hợp đồng điều phối vừa thêm vào mục 3 |
| Adapter SePay và PayPal được gọi lại, retail `PaymentService` không đổi công thức amount | Đã thiết kế | Đạt chỉ khi đơn eSIM return trước đoạn `amount = total_amount` |
| MegaPay thẻ, điện thoại, nạp giữ nguyên | Đã xác minh đường hiện tại. Đã thiết kế không cho eSIM đi vào | Đạt khi nhánh retail không bị sửa |
| Failover MegaPay → SePay | Đã xác minh nằm trong `PaymentService.createPayment` khi gateway MEGAPAY | Đạt nếu eSIM không vào hàm đó. Retail vẫn cần test |
| Ví và ledger đại lý | Đã xác minh webhook nạp chạy trước webhook đơn | Đạt. Thiết kế không đổi nhánh đó và không đọc FX trong ledger |
| Notification, webhook, finance | Đã xác minh đang dùng chung | Không đạt nếu chỉ thêm service mới mà vẫn để eSIM trong hàm cũ |

Đã xác minh ba cửa đang dùng chung:

- `POST /payments` → `PaymentService.createPayment`. PayPal nhận `orders.total_amount` và nhãn USD.
- `POST /payments/webhook/:gateway` → `PaymentService.handleWebhook` → `markPaidInTransaction`.
- PayPal return → `PaypalReturnClient` gọi `syncFromGateway`, cùng có thể đánh dấu PAID và dispatch.

`notifyPaymentSuccess` đưa `orders.total_amount` vào email, không có currency. `notifyEsimReady` không in số tiền.

Sửa thiết kế: mục “Hợp đồng điều phối”. eSIM rời cả ba cửa trước nhánh retail. Charge USD không gọi `notifyPaymentSuccess`. Webhook nạp ví giữ vị trí hiện tại.

Điểm này chưa tồn tại trong code. Gọi tên `EsimPaymentService` trong lúc review không có nghĩa là class đó đã có.

## B. Payment invariants

| Invariant | Nhãn | Kết quả |
| --- | --- | --- |
| Một payment eSIM `PENDING` hoặc `SUCCESS` cho một order | Đã thiết kế | Unique index một phần. Retail `product_lane` null không nằm trong index |
| Payment khớp provider và currency snapshot | Đã thiết kế | Chưa có cột để khớp |
| PAID chỉ từ `WAITING_PAYMENT` | Đã thiết kế `claimEsimPaid` | Hàm retail `updatePaymentStatus` hiện không có điều kiện này. Đã xác minh. eSIM không được gọi hàm đó |
| Hai webhook đồng thời | Đã thiết kế | Index chặn hai dòng mở. Dòng cũ trước index thì advisory lock và update có điều kiện. Một bên rollback |
| Webhook trùng | Đã xác minh claim `PENDING` trên cùng payment. Đã thiết kế giữ claim đó | PayPal đã có cờ `fulfillmentQueued`. SePay trùng không dispatch lại |
| Sai thứ tự FAILED rồi SUCCESS | Đã xác minh claim thất bại, không tự đảo PAID | Thiết kế giữ |
| SUCCESS muộn hoặc hết hạn | Đã xác minh late success vào manual review, không queue | Thiết kế giữ |
| PayPal voided/cancelled | Đã xác minh rule đổi voided thành FAILED, không phải SUCCESS | Thiết kế ghi rõ không cấp phát. Schema không có trạng thái đơn `CANCELLED` |
| Cờ tắt checkout vẫn xác minh payment đã tạo | Đã thiết kế sau khi sửa | Trước review, ý này chỉ nằm ở đoạn dừng rollout, chưa thành invariant của webhook |

Chính sách “một payment đang mở” trong bản thiết kế là: không có đồng thời `PENDING` và `SUCCESS`, và không có hai `SUCCESS`. `FAILED` hoặc `EXPIRED` không được mở payment mới trên cùng đơn. Checkout lại là đơn mới, snapshot mới nếu là USD. Đây là chính sách đã chọn, chưa phải hành vi đang chạy.

## C. FX và quote

| Điểm | Nhãn | Kết quả |
| --- | --- | --- |
| Rate là số VND cho 1 USD | Đã thiết kế, cần quyết định | Công thức charge là `catalog_vnd / rate` |
| Hiệu lực | Đã thiết kế | `effective_from`, một dòng `EFFECTIVE`, publish trong một transaction |
| Nguồn và timestamp | Đã thiết kế | `source_code` và `observed_at`. Chưa có nhà cung cấp |
| Hạn dùng | Đã thiết kế sau khi sửa | `now - observed_at <= max_staleness_seconds`. Con số 86400 chưa chốt |
| Catalog không gọi FX provider | Đã thiết kế | Chỉ job định kỳ gọi interface. Trang offers đọc DB |
| Đơn đã tạo không đổi theo sổ mới | Đã thiết kế | Cột snapshot cấm UPDATE |
| Làm tròn USD | Đã thiết kế sau khi sửa | Decimal `ROUND_HALF_UP` scale 2. `100000 / 25000 = 4.00`. `1.005` thành `1.01`. Cấm số thực JavaScript |
| Band 2% | Đã thiết kế công thức, con số cần quyết định | `abs(new - current) / current > 0.02` cả hai chiều. Rate đầu tiên phải publish tay |
| FX hết hạn | Đã thiết kế | Đơn PayPal mới bị từ chối. Payment đã tạo vẫn settle. SePay VND không phụ thuộc |

Trước review, band chỉ nói “lệch quá 2%” và hạn dùng không chỉ rõ đồng hồ nào. Hai chỗ đó đã được viết lại trong mục 6 của thiết kế. Chưa triển khai.

`usd_vnd_rate = 26000` trên catalog local đã xác minh là không được đọc. Không có quote trước checkout. Cam kết giá vẫn là lúc tạo đơn, trong 15 phút đã có của `payment_expires_at`.

## D. Legacy và dữ liệu production

| Nhóm | Nhãn | Cách xử lý trong thiết kế |
| --- | --- | --- |
| MEGAPAY và SEPAY cũ | Đã xác minh local không có cột currency. Đã thiết kế | Backfill VND và `charge_amount = total_amount` sau report read-only. Không làm trong review này |
| PayPal admin-test | Đã xác minh local đơn `103000.00`, payment `1.00`, `EXPIRED` | Giữ hai số. Loại khỏi doanh thu. Không sửa cho khớp |
| Chưa biết currency | Đã thiết kế | `UNVERIFIED_PAYPAL` hoặc `UNVERIFIED_SPLIT`. Không vào tổng |
| Amount payment khác amount đơn | Đã thiết kế | `UNVERIFIED_SPLIT`. Không suy USD từ gateway |
| Không có bằng chứng provider | Đã thiết kế sau khi sửa | `NO_PROVIDER_EVIDENCE`. Không hoàn tự động |
| Production | Chưa xác minh | Audit chỉ đọc database local |

Đã xác minh code hoàn tiền hiện suy currency bằng `inferRefundCurrency`: PayPal thành USD, gateway khác thành VND. Thiết kế cấm dùng hàm này khi chưa có `payments.currency`, và cấm dùng số `orders.total_amount` để hoàn đơn PayPal admin-test. Hàm cũ vẫn đang nằm trong code. Review không xóa nó.

Cấm backfill `CASE gateway WHEN 'PAYPAL' THEN 'USD' ELSE 'VND' END`.

## E. Admin, email, finance

| Điểm | Nhãn | Kết quả |
| --- | --- | --- |
| Admin phân biệt catalog, charge, currency, provider | Đã thiết kế màn hình và API | Admin hiện tại chưa có các cột này. eSIM ops đang suy PayPal = USD. Quy ước đó không được mang sang báo cáo mới |
| Không cộng VND với USD | Đã thiết kế API riêng | Chưa đủ. `ProfitService` và vài báo cáo khác đang cộng `total_amount` rồi gán VND. Nếu `total_amount` của đơn USD vẫn là catalog VND, báo cáo retail sẽ cộng nhầm |
| Sửa thứ tự | Đã thiết kế sau khi sửa | Bộ lọc loại đơn USD và PayPal chưa phân loại phải xong trước khi bật cờ USD. Khi chưa có đơn USD, tổng VND thẻ và nạp không đổi |
| Email USD | Đã xác minh `notifyPaymentSuccess` in `total_amount` không currency. `notifyEsimReady` không in số | Charge USD không được gọi hàm email thanh toán. Không coi template là đã hỗ trợ đa currency |
| Refund có currency | Đã thiết kế đọc payment snapshot | Hàm suy currency từ gateway đang tồn tại và không được dùng cho đường mới |
| Báo cáo bán lẻ | Đã thiết kế không đổi công thức, chỉ thêm bộ lọc loại trừ | Cần test: trước và sau bộ lọc, tổng VND của đơn không phải eSIM USD vẫn giống nhau |

## F. Feature flags và rollout

| Điểm | Nhãn | Kết quả |
| --- | --- | --- |
| Tắt PayPal checkout không tắt webhook | Đã thiết kế sau khi sửa | Hai cờ chỉ chặn tạo đơn và tạo payment INTL |
| Rollback về SePay VND | Đã thiết kế | Tắt cờ USD. SePay không đọc cờ đó. Cột mới để nguyên |
| Payment đang chờ vẫn xử lý được | Đã thiết kế | Settle theo snapshot dù cờ đã tắt hoặc rate mới đã vào sổ |
| Log lệch amount/currency | Đã thiết kế | Log order id, reference, hai currency. Không log secret hay raw body |
| Điều kiện dừng | Đã thiết kế | Lệch webhook, USD không có rate id, FX quá hạn mà cờ vẫn bật, hai payment SUCCESS, regression retail fail, tổng trộn currency |

Chưa có cờ nào trong code. Tắt cờ không phải cơ chế đang chạy.

## Điểm đạt

- Catalog gốc VND, amount do backend tính, locale không chọn cổng.
- SePay USD để UNVERIFIED và tắt. PayPal không nhận số VND.
- Bốn lớp catalog, cost, charge, display tách nhau. Cost không bị mặc định bằng catalog.
- Không dùng 26000.
- Fulfillment không thêm điều kiện currency. Một CREATE, không refund tự động khi Airalo lỗi.
- Đơn cũ nullable. Không `NOT NULL` trên toàn bảng `orders` hoặc `payments`.
- Race eSIM được mô tả bằng index và update có điều kiện, không sửa ngầm `markPaidInTransaction` của retail.
- MegaPay và ví đại lý nằm ngoài lane eSIM.

## Điểm đã phải sửa trong thiết kế

Các mục này thiếu hoặc nguy hiểm trong bản trước review. Đã viết lại trong file kiến trúc. Vẫn chưa code.

1. Ba cửa `createPayment`, webhook và `syncFromGateway` phải rẽ eSIM trước nhánh retail.
2. Band 2% cần công thức hai chiều, và rate đầu tiên publish tay.
3. Hạn FX tính từ `observed_at`, không từ lúc khách mở trang.
4. Làm tròn USD bằng Decimal half-up, có ví dụ.
5. Báo cáo dùng chung phải loại đơn USD trước khi bật cờ, nếu không catalog VND của đơn USD bị cộng vào tổng VND.
6. Email charge USD không gọi `notifyPaymentSuccess`.
7. `inferRefundCurrency` không được dùng khi chưa có currency trên payment.
8. Thêm lớp `NO_PROVIDER_EVIDENCE`.
9. Cờ tắt không được bỏ qua webhook của payment đã tạo.
10. PayPal voided không cấp phát. Không bịa trạng thái đơn `CANCELLED`.

## Rủi ro còn lại

| Rủi ro | Nhãn | Mức |
| --- | --- | --- |
| Implementation để eSIM trong `PaymentService.createPayment` | Đã xác minh đó là đường hiện tại | Cao nếu làm sai hợp đồng điều phối |
| Production có PayPal khách khác admin-test | Chưa xác minh | Cao trước backfill và trước báo cáo |
| Airalo live cost currency khác local | Chưa xác minh. Local toàn VND | Trung bình với lợi nhuận, không chặn thu VND |
| SePay USD | Chưa xác minh | Không được bật |
| Race hai payment của thẻ | Đã xác minh hàm retail chưa khóa | Trung bình, cố ý để ticket retail riêng |
| Email hiện in số không đơn vị | Đã xác minh | Cao nếu gọi cho đơn USD |
| Hai dòng `EFFECTIVE` nếu publish không cùng transaction | Đã thiết kế cách chặn | Trung bình nếu implementation bỏ transaction |

## Quyết định cần phê duyệt

| # | Quyết định | Chặn implementation nào |
| --- | --- | --- |
| 1 | Chấp nhận bản thiết kế sau review, không dùng default VND của đoạn 2B audit | Mọi phase |
| 2 | Nhà cung cấp tỷ giá | Phase FX và USD |
| 3 | Chu kỳ fetch và `max_staleness_seconds` | USD |
| 4 | Chấp nhận band 2% và chiều `abs(new-current)/current` | Publish tự động |
| 5 | Xác nhận rate là VND cho 1 USD | Công thức charge |
| 6 | Market vẫn là lựa chọn tường minh, không phải IP hay locale | Checkout |
| 7 | Không sửa `markPaidInTransaction` retail trong đợt eSIM | Phase settlement |
| 8 | Abandon khi chưa tạo payment có được phép trước 15 phút không | API abandon. Không chặn SePay |
| 9 | Bằng chứng merchant PayPal USD | Bật cờ production |

SePay USD và currency giá vốn Airalo live không cần chốt để thu VND, nhưng phải giữ trạng thái chưa xác minh.

## Checklist trước implementation

- [ ] Chủ sản phẩm duyệt file kiến trúc đã sửa và biên bản này.
- [ ] Chốt quyết định 4 và 5, hoặc ghi là hoãn USD và chỉ làm phase SePay VND.
- [ ] Không mở migration, không backfill, không gọi PayPal hay SePay thật trong lúc chờ duyệt.
- [ ] Phase đầu tiên của code, khi được duyệt, là điều phối eSIM ra khỏi ba cửa retail và snapshot SePay VND.
- [ ] Test regression thẻ MegaPay, failover, nạp, webhook ví, và một đơn eSIM SePay VND nằm trong cùng phase với điều phối.
- [ ] Report production read-only xong trước mọi `UPDATE` currency.
- [ ] Bộ lọc báo cáo và chặn email USD xong trước khi `ESIM_USD_CHECKOUT_ENABLED` có thể bật.
- [ ] Không gọi `inferRefundCurrency` cho payment chưa có currency.

## Thứ tự triển khai đề xuất

Chỉ sau khi duyệt. Không thực hiện trong review này.

| Phase | Việc | Chưa làm trong phase |
| --- | --- | --- |
| 0 | Duyệt thiết kế và các quyết định không chặn SePay | Code |
| 1 | Expand cột nullable, bảng FX rỗng, capability. Không default currency | Backfill |
| 2 | Report production read-only | UPDATE |
| 3 | Backfill VND chỉ MEGAPAY và SEPAY | Gán USD cho PayPal |
| 4 | Rẽ eSIM khỏi create, webhook, sync. Snapshot SePay VND. `claimEsimPaid`. Unique một payment mở | Sửa hàm PAID retail. Bật USD |
| 5 | Chặn MEGAPAY trên eSIM. Regression failover retail | Đổi amount thẻ |
| 6 | Lọc USD và PayPal chưa phân loại khỏi báo cáo VND dùng chung. Chặn email số tiền khi charge USD. Hoàn eSIM đọc snapshot | Đổi công thức lợi nhuận thẻ |
| 7 | Interface FX, chưa có nguồn APPROVED, chưa gọi mạng | Chọn nhà cung cấp thay chủ sản phẩm |
| 8 | Sandbox USD rồi mới cờ production, khi quyết định 2–5 và 9 đã có | Tắt webhook payment cũ. Gửi số VND sang PayPal |
| 9 | Template email charge kèm currency | Ghi USD vào template đang dùng `total_amount` |

Dừng chờ nghiệm thu thiết kế.
