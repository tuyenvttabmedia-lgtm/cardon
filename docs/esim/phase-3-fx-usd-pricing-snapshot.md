# Phase 3 — FX và USD pricing snapshot

Ngày: 2026-11-06. Nối tỷ giá thủ công vào đơn eSIM quốc tế và vào PayPal USD đã nghiệm thu ở Phase 2C. Không đổi webhook, settlement hay fulfillment PayPal. Không đổi SePay, admin-test, thẻ, nạp cước, ví đại lý hay MegaPay. Không bật cổng production. Không sang Phase 4.

## 1. File thêm và sửa

| File | Việc |
| --- | --- |
| `src/modules/fx/fx-rate.rules.ts` | Quy ước 1 USD = X VND, ngưỡng 2%, chọn tỷ giá checkout, làm tròn USD |
| `src/modules/fx/fx-rate.service.ts` | Nháp, công bố, phê duyệt, một tỷ giá EFFECTIVE, không sửa tỷ giá đã dùng |
| `src/modules/fx/fx-rate.rules.spec.ts` | Test quy tắc FX và làm tròn |
| `src/modules/fx/fx-rate.service.spec.ts` | Test nháp, công bố, ngưỡng, từ chối sửa |
| `src/modules/esim/esim-usd-snapshot.spec.ts` | Test snapshot INTL/VN, khóa đơn cũ, từ chối amount từ client |
| `src/modules/esim/esim-order.service.ts` | Đơn khách INTL khóa snapshot USD trong transaction tạo đơn |
| `src/modules/esim/esim-market.rules.ts` | Thị trường lấy từ quốc gia của package |
| `src/modules/esim/esim.controller.ts` | `GET /esim/quote` đọc giá từ server |
| `src/modules/admin/controllers/settings-admin.controller.ts` | API FX, chỉ SUPER_ADMIN như các cấu hình khác |
| `src/modules/admin/dto/settings.dto.ts` | `CreateFxRateDto` |
| `src/modules/admin/admin.module.ts` | Đăng ký `FxRateService` |
| `apps/admin/app/configuration/fx-rates/page.tsx` | Cấu hình → Tỷ giá |
| `apps/admin/lib/configuration-routes.ts` | Mục menu |
| `apps/admin/services/api-client.ts` | Client FX |
| `apps/web/components/esim/EsimDetailClient.tsx` | Gói không phải VN đi checkout `market=INTL` |
| `apps/web/app/checkout/CheckoutPageClient.tsx` | Hiện số USD do server báo, không tự tính |

Không sửa `buildEsimVndPriceSnapshot`, `calculateCustomerPaid`, `sellPriceFromAiralo`, PayPal webhook/settlement, SePay, schema.

## 2. Thiết kế FX

Schema Phase 1 giữ nguyên. Nguồn tay là `MANUAL_USD_VND`, cặp USD/VND. Chưa có nguồn tự động. Cột `fetchIntervalSeconds` để trống cho nguồn tự động sau này.

Trạng thái dùng enum sẵn có:

| Trạng thái | Ý nghĩa |
| --- | --- |
| `DRAFT` | Mới nhập, chưa dùng để bán |
| `PENDING_REVIEW` | Lệch hơn 2% so với tỷ giá EFFECTIVE, chờ phê duyệt |
| `EFFECTIVE` | Được dùng cho đơn mới |
| `SUPERSEDED` | Đã bị tỷ giá sau thay thế |
| `REJECTED` | Có trong enum, Phase 3 không dùng để xóa lịch sử |

Không có trạng thái `EXPIRED`. Hết hạn là `effective_to` đã qua, hoặc `now - observed_at` lớn hơn `fx_rate_sources.max_staleness_seconds`. Staleness nằm trên nguồn. Bản nháp ghi số giây vào `band_result` dạng `HOLD:<giây>` và chỉ ghi sang nguồn khi tỷ giá đó trở thành EFFECTIVE, nên một bản nháp không làm tỷ giá đang bán bị stale.

Quy ước mọi chỗ: `rate` là số VND cho 1 USD. Không đảo chiều.

Công bố nằm trong transaction với `pg_advisory_xact_lock(hashtext('fx-usd-vnd'))`. Tỷ giá EFFECTIVE trước đó chuyển `SUPERSEDED` và nhận `effective_to`. Không có hai EFFECTIVE cùng cặp. Không có API sửa số của một dòng đã tạo. `rejectEdit` từ chối khi đã có đơn trỏ vào dòng đó, và từ chối mọi trạng thái khác `DRAFT`. Muốn đổi giá thì tạo dòng mới.

Ngưỡng:

`abs(new_rate - current_rate) / current_rate > 0.02`

Đúng 2% vẫn trong biên và công bố được (`25500` so với `25000` đã công bố trực tiếp trên local). Vượt 2% thì `publish` chỉ chuyển `PENDING_REVIEW`. `approve` mới đưa dòng đó lên EFFECTIVE. Không có tỷ giá EFFECTIVE thì dòng đầu được công bố, không cần so sánh.

## 3. Công thức giá đang dùng

Không thêm margin mới.

- Giá bán niêm yết là `product_variants.sell_price`, qua `PricingService.getCustomerPrice`.
- Số VND khách trả là `calculateCustomerPaid`: phí cổng không cộng vào khách. `totalPayment = round(sell)`. PayPal đang cấu hình phí 0 nên số này bằng giá bán đã làm tròn.
- Cột `profit` trên đơn vẫn là công thức VND cũ: khách trả trừ phí trừ `providerCost`.
- Catalog snapshot giữ VND và đúng giá bán đã cấu hình.
- Giá vốn snapshot lấy `cost_currency` và `cost_amount` của package `PUBLISHED` khi số đó dương. Package AE dùng trong sandbox đang lưu giá vốn VND `69085`, nên snapshot cost là VND. Không quy đổi giá vốn và không đọc `resolveAiraloUsdVndRate` hay mốc 26000.
- Đơn khách `INTL`: `charge_usd = ROUND_HALF_UP(customerPaidVnd / vndPerUsd, 2)`. Dưới `0.01` thì từ chối. `orders.total_amount` vẫn là số VND, không phải số gửi PayPal.
- Đơn `VN` và admin-test giữ `buildEsimVndPriceSnapshot`. Admin-test PayPal vẫn chỉ ghi `1.00` trong `clientTrace`.

Thị trường lấy từ package: `country_iso = VN` hoặc `destination_key` là `vn` / `vietnam` thì `VN`, còn lại `INTL`. Client gửi sai thị trường thì từ chối. Không suy từ ngôn ngữ, IP hay cổng thanh toán. Đơn đã tạo không đổi `esim_market`.

## 4. Khóa snapshot

Trong transaction tạo đơn, sau advisory lock của đơn:

1. Nếu còn đơn chờ cùng user, cùng variant, cùng thị trường và với INTL đã có `charge_currency = USD`, trả lại đơn đó. Không ghi snapshot mới.
2. Đơn khách INTL đọc lại tỷ giá EFFECTIVE trong transaction rồi mới insert.
3. Ghi `catalog_*`, `charge_*`, `cost_*`, `fx_rate_id`, `fx_rate`, `fx_as_of` (bằng `observed_at`), `pricing_locked_at` trên đơn và trên `esim_order_quotes`.

Thiếu tỷ giá EFFECTIVE, tỷ giá hết hạn, quá staleness, hai EFFECTIVE, không có giá bán hoặc giá vốn dương: không tạo đơn. `POST /orders` bật whitelist nên body có `amount` hoặc `fxRate` bị `400` trước khi vào service. Hạn PayPal tính trên số USD vừa quy đổi, không tính trên số VND.

PayPal Phase 2C đọc `charge_amount` đã khóa. Không tính lại tỷ giá lúc thanh toán. Retry trả cùng payment. `orders.total_amount` không được gửi làm số USD.

## 5. Migration

Không có migration. `fx_rate_sources`, `fx_rates` và các cột snapshot trên `orders` / `esim_order_quotes` từ Phase 1 đã đủ. Một EFFECTIVE được giữ bằng khóa transaction, không cần index mới. Không backfill đơn cũ.

## 6. Kết quả test

Các suite liên quan đều pass:

- `fx-rate.rules.spec.ts`, `fx-rate.service.spec.ts`, `esim-usd-snapshot.spec.ts`, `esim-order-idempotency.spec.ts`: 24 tests.
- `esim-admin-test-order.spec.ts`: admin-test INTL vẫn charge VND `103000`, không bị đổi sang USD.
- `esim-order-snapshot.spec.ts`, `esim.offers.spec.ts`, `esim-market.rules.spec.ts`.
- `esim-paypal-payment.spec.ts`, `esim-sepay-payment.spec.ts`, `payment.service.spec.ts`, `payment.sepay-webhook.spec.ts`, `paypal.checkout.spec.ts`, `paypal-limits.rules.spec.ts`.
- `paypal-admin.spec.ts`, `paypal-admin-test-payment.spec.ts`: 24 tests.
- `apps/web` `lib/esim-paypal.test.ts`: 3 tests.

Cover các case bắt buộc: nháp, công bố, tỷ giá không hợp lệ, đúng 2% được công bố, trên 2% chờ duyệt, một EFFECTIVE, hết hạn, quá staleness, không sửa dòng đã dùng, INTL ra USD, VN giữ VND, thiếu FX thì từ chối, thiếu giá vốn thì từ chối, USD tối đa 2 số, lưu đúng FX id và thời điểm, đổi FX không đổi đơn cũ, client không ghi đè amount, retry không tạo snapshot khác. PayPal nhận `charge_amount`. SePay và admin-test không đổi đường.

## 7. PayPal Sandbox local

API local được build lại với `RUN_MIGRATIONS=false` và `RUN_SEED=false`. Worker, Postgres, Redis, nginx không recreate.

Đã bật tạm `customerEsimEnabled` để tạo một đơn khách, rồi trả lại `false`. Đã xác nhận DB vẫn là `false`.

Đơn thật, không insert snapshot bằng SQL:

| Mục | Giá trị |
| --- | --- |
| Đơn | `ORD-20261106-090177` |
| Package | AE, variant `1bb9f03b-46e3-43c6-a9df-79d0c902eafd` |
| Catalog | VND `103000` |
| Cost | VND `69085` |
| Charge | USD `4.12` |
| FX lúc tạo đơn | `25000` (`4894c690-2593-4398-ae49-5d0aac5f6884`) |
| `total_amount` | VND `103000` |
| Payment | `PAY-7AACA357AAD04772B342` |
| Payment amount | USD `4.12` |
| `product_lane` | `ESIM` |
| `fx_rate_id` | cùng id ở trên |
| PayPal Order | `0BY20271CC979333C` |
| Host | `www.sandbox.paypal.com` |

`103000 / 25000 = 4.12`. Retry với idempotency key khác trả cùng reference, vẫn một payment. Body có `amount` và `fxRate` bị HTTP 400. Sau đó công bố `25500` (đúng 2%). Đơn cũ vẫn `4.12` và vẫn trỏ FX `25000`. Quote mới của cùng variant là USD `4.04` theo `25500`.

Chưa capture. Đơn vẫn chờ thanh toán.

Trên admin `http://admin.localhost/configuration/fx-rates`, super admin thấy tỷ giá hiệu lực `1 USD = 25500 VND`. Tạo nháp `27000` rồi bấm Công bố: dòng chuyển sang chờ phê duyệt, tỷ giá hiệu lực không đổi. Chưa bấm Phê duyệt.

Admin và web local đã được build lại để có trang tỷ giá và nút mua gói quốc tế. Worker không build lại.

## 8. Còn lại

- Local đang có một tỷ giá EFFECTIVE `25500`, hai dòng `25000` đã SUPERSEDED, và một dòng `27000` PENDING_REVIEW chưa phê duyệt. Đây là dữ liệu sandbox, không phải production.
- Đơn `ORD-20261106-090177` và payment PayPal ở trên còn chờ. Không capture, không fulfillment.
- `customerEsimEnabled` local đã trả về tắt.
- Chưa có FX tự động, báo cáo tài chính, dashboard, Visa, Mastercard, NAPAS.
- Production không bị migration và không bị bật cổng.
