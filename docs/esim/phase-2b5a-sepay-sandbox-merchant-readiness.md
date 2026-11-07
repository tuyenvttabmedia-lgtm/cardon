# Phase 2B.5A — SePay Sandbox Merchant Readiness

Ngày: 2026-11-06. Chỉ kiểm tra. Không nhập credential, không bật sandbox, không sửa env, Compose, Nginx, tunnel, DNS hay payment code. Không tạo checkout và không thực hiện giao dịch.

## Kết luận

**BLOCKED cho checkout eSIM trên máy này**, chỉ vì env API chưa có Merchant ID và Merchant Secret Sandbox. `ESIM_SEPAY_SANDBOX_ENABLED` vẫn `false`.

Không bị chặn bởi Webhook URL. Tài liệu SePay không yêu cầu Webhook URL để khách thanh toán sandbox. Form checkout chỉ cần Merchant ID, Merchant Secret và các URL trình duyệt `success_url`, `error_url`, `cancel_url`. Cloudflare Tunnel không được dùng để đăng ký hay xác nhận Webhook URL trên SePay. Chưa có URL nào được ghi lên Merchant Portal.

## 1. Merchant Sandbox

| Hạng mục | Tình trạng |
| --- | --- |
| Tài khoản Merchant Sandbox | không xác nhận được. Máy này không có phiên Merchant Portal |
| Merchant ID | chưa được cấp vào môi trường local |
| Merchant Secret | chưa được cấp vào môi trường local |
| IPN Secret Key | chưa được cấp vào môi trường local |
| Quyền Payment Gateway Sandbox | không xác nhận được vì không vào được portal |
| Quyền cấu hình IPN URL | không xác nhận được vì không vào được portal |
| Phương thức thanh toán Sandbox được SePay công bố | không có tài liệu portal trong repo. Code checkout gửi `payment_method=BANK_TRANSFER`, đó không phải xác nhận từ SePay |

Không suy đoán phần còn thiếu ngoài những gì đọc được từ env và source.

## 2. Credentials

Chỉ ghi có hay không. Không ghi giá trị.

| Biến | `.env.local-full` | Container API | Web / worker |
| --- | --- | --- | --- |
| `ESIM_SEPAY_SANDBOX_ENABLED` | PRESENT, giá trị `false` | PRESENT, giá trị `false` | ABSENT |
| `ESIM_SEPAY_SANDBOX_MERCHANT_ID` | MISSING | MISSING | ABSENT |
| `ESIM_SEPAY_SANDBOX_MERCHANT_SECRET` | MISSING | MISSING | ABSENT |
| `ESIM_SEPAY_SANDBOX_IPN_SECRET` | MISSING | MISSING | ABSENT |

Process env của Windows user hiện tại không có bốn biến eSIM.

`SEPAY_API_KEY` và `SEPAY_WEBHOOK_SECRET` là cặp webhook bán lẻ / đại lý, có trong API. Không phải credential eSIM Sandbox và không có prefix `spsk_live_`. Code eSIM không dùng hai biến này cho checkout hay IPN.

`readEsimSepaySandboxConfig` từ chối secret bắt đầu bằng `spsk_live_` khi sandbox được bật. Hiện chưa có secret để đối chiếu prefix.

## 3. Webhook URL và IPN

Đây là hai thứ khác nhau. Đối chiếu `docs/esim/multi-currency-architecture-design.md` mục 15 và trang SePay [luồng thanh toán](https://developer.sepay.vn/en/cong-thanh-toan/luong-thanh-toan), [IPN](https://developer.sepay.vn/en/cong-thanh-toan/IPN).

| Việc | Tài liệu | Việc đã làm |
| --- | --- | --- |
| Khách thanh toán sandbox | Form POST `https://pay-sandbox.sepay.vn/v1/checkout/init`. SePay kiểm tra chữ ký, mở trang thanh toán, rồi redirect `success_url` / `error_url` / `cancel_url` | Không cần Webhook URL. Form eSIM không có field webhook |
| Webhook biến động số dư | `POST /api/v1/payments/webhook/sepay`, nạp ví đại lý | Không đụng. Không phải cổng checkout eSIM |
| IPN Payment Gateway | Bước sau khi đã có kết quả thanh toán. URL cấu hình ở Payment Gateway → Configuration → IPN, header `X-Secret-Key` | Cardon chỉ đánh `PAID` khi nhận IPN. Redirect không được coi là bằng chứng |

`https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` là endpoint IPN để SePay gọi ngược sau thanh toán. Tunnel chỉ làm URL đó thành HTTPS public, đúng gợi ý local của trang IPN SePay. Tunnel không đăng ký URL đó vào SePay và không xác nhận Webhook URL.

Đăng ký IPN trên portal: chưa làm. Không phải điều kiện để trang thanh toán sandbox mở.

## 4. API và hạ tầng

Không đổi cấu hình. Kết quả đo lại:

| Kiểm tra | Kết quả |
| --- | --- |
| Route `POST /api/v1/payments/ipn/esim/sepay` | có trong `payment.controller.ts` |
| Xác thực IPN | header `X-Secret-Key`, so với `ESIM_SEPAY_SANDBOX_IPN_SECRET` sau khi config hợp lệ |
| Checkout URL | hằng `https://pay-sandbox.sepay.vn/v1/checkout/init` |
| `spsk_live_` | bị từ chối trong `esim-sepay-sandbox.config.ts` |
| `POST` public IPN, không secret | HTTP 401 từ API |
| `GET` public IPN | HTTP 405 từ Nginx |
| `POST` public path webhook đại lý | HTTP 404 từ Nginx |
| `POST http://127.0.0.1:8081/.../ipn/esim/sepay` | HTTP 401 |
| Tunnel `cardon-esim-ipn-sandbox` | ID `7595a4a5-7a8e-4ea1-b894-b089dd651574`, connector `b9f6a8fb-3ee9-401b-b188-0c6a767ec30a` đang nối |
| Service `cloudflared` cũ | vẫn Running, không dùng cho tunnel eSIM |

Khi `ESIM_SEPAY_SANDBOX_ENABLED` không phải `true`, IPN trả 401 `Invalid signature` trước khi so secret. Đó là fail-closed, không phải 404.

## 5. Checkout configuration

Đọc source, không gọi checkout.

| Quy tắc | Kết quả |
| --- | --- |
| Số tiền | `orders.charge_amount`. `createFromSnapshot` không đọc `orders.total_amount` |
| Currency | `VND`. Snapshot không phải VND thì từ chối |
| `product_lane` | `ESIM` |
| Retail failover | nhánh eSIM return trước khi gán `totalAmount` và trước MegaPay failover |
| PayPal / MegaPay cho đơn chỉ có eSIM | từ chối, chỉ nhận SePay |
| Agent wallet | service eSIM không gọi wallet hay ledger |
| Webhook đại lý | vẫn là `POST /api/v1/payments/webhook/:gateway`, không dùng IPN eSIM |
| Giao dịch tài chính khi settlement | chỉ chuyển `B2C_CHECKOUT` từ PENDING/FAILED sang COMPLETED sau khi order được đánh dấu PAID |

Checkout thật hiện không tạo được: config sandbox không `ok` nên API trả `eSIM SePay sandbox is not configured`.

## 6. Còn thiếu

Để mở trang thanh toán sandbox của eSIM, env API cần Merchant ID và Merchant Secret Sandbox. Không dùng giá trị `spsk_live_`. Không cần Webhook URL cho bước này.

IPN Secret chỉ cần khi muốn SePay gọi endpoint để Cardon tự đánh dấu đơn `PAID`. Redirect sau thanh toán không làm việc đó. Secret này do merchant tự đặt trên tab IPN, khác Merchant Secret và khác `SEPAY_WEBHOOK_SECRET`.

## 7. Trước Phase 2B.5B

1. Điền Merchant ID và Merchant Secret Sandbox vào env API, rồi mới bật `ESIM_SEPAY_SANDBOX_ENABLED`. Phase này không làm việc đó.
2. Không chặn bước checkout vì chưa có Webhook URL.
3. IPN URL trên portal chỉ cần trước giao dịch muốn đối soát server-to-server. Không gộp điều kiện đó vào việc mở trang thanh toán.

## 8. Không làm

Không nhập credential, không bật sandbox, không sửa `.env`, Compose, Nginx, tunnel, DNS, payment code. Không recreate container, không migration, không giao dịch.
