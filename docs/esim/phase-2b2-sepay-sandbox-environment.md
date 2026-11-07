# Phase 2B.2 — Chuẩn bị môi trường SePay Sandbox

Ngày: 2026-11-06. Phạm vi là cấu hình và deploy API local. Không sửa PaymentService, signer bán lẻ, webhook đại lý, ví, ledger, PayPal hay Airalo. Không tạo giao dịch Sandbox và không chuyển sang Phase 2C.

Kết luận: API local đã chạy image mới và route IPN không còn 404. Sandbox vẫn **BLOCKED** vì chưa có credential và `APP_PUBLIC_URL` của stack này vẫn là HTTP loopback. SePay trên Internet chưa gọi được endpoint này.

## 1. File cấu hình đã đổi

- `docker-compose.local-full.yml` — bốn biến `ESIM_SEPAY_SANDBOX_*` chỉ gắn vào service `api`, không phải build arg.
- `.env.local-full` — thêm bốn key ở trạng thái tắt và để trống. Không ghi đè `APP_PUBLIC_URL`.
- `.env.example` — ghi tên biến, để comment, không có secret.
- `src/config/env.validation.ts` — khai báo bốn biến là optional để chuỗi rỗng không làm API từ chối boot. Không đổi logic thanh toán.

Không sửa `docker/Dockerfile.api`. Secret không đi vào build args hay layer image.

## 2. Compose project và service

Project đang chạy là `cardon-local-full`, file `docker-compose.local-full.yml`.

| Service | Thay đổi |
| --- | --- |
| `api` (`cardon-local-full-api`) | Nhận bốn biến eSIM. Đã build và recreate container này |
| `worker` | Không nhận bốn biến. Container không recreate |
| `web`, `partner`, `admin` | Không nhận bốn biến |
| `postgres`, `redis`, `nginx` | Không recreate, không đổi volume |

`APP_PUBLIC_URL` vẫn nằm trong env chung của API và worker như trước. Giá trị không đổi.

## 3. Image

Tag vẫn là `cardon-api:local-full`.

| | Image id |
| --- | --- |
| API trước | `sha256:c1dc6006c9787bac0b34160cf84830d355f7bc69a9564486662f0a22d595a2b4` |
| API sau | `sha256:b541448d1551063fd0ad4749de9d3056c14e681b8f492b9b63398543c72d0f0c` |
| Worker | `sha256:3c49ede351a6831d4aeb4dd705658d5b229ac49857ec87bdf7600e1e358efa91` — không đổi |

Build `docker compose ... build api` thành công. Deploy dùng `up -d --no-deps --force-recreate api` với `RUN_MIGRATIONS=false` và `RUN_SEED=false`. Không chạy `docker compose down` và không dùng `-v`.

## 4. Biến môi trường

Chỉ PASS/FAIL. Không ghi giá trị.

| Biến | Host `.env.local-full` | API container | Web | Worker |
| --- | --- | --- | --- | --- |
| `ESIM_SEPAY_SANDBOX_ENABLED` | PASS, đang disabled | PASS, disabled | FAIL, không có — đúng vì web không cần | FAIL, không có — đúng vì worker không gọi checkout hay IPN |
| `ESIM_SEPAY_SANDBOX_MERCHANT_ID` | PASS, empty | PASS, empty | absent | absent |
| `ESIM_SEPAY_SANDBOX_MERCHANT_SECRET` | PASS, empty | PASS, empty | absent | absent |
| `ESIM_SEPAY_SANDBOX_IPN_SECRET` | PASS, empty | PASS, empty | absent | absent |
| `APP_PUBLIC_URL` | có, HTTP loopback | có, HTTP loopback | không dùng biến này | có từ env chung, không đổi |

Sandbox không được bật. Không có Merchant ID, Merchant Secret hay IPN Secret để bật, và không tự tạo.

## 5. Route, health và log

API container `running`, health `healthy`. `GET http://localhost/health` trả 200.

Log khởi động có `Mapped {/api/v1/payments/ipn/esim/sepay, POST}` và vẫn có `Mapped {/api/v1/payments/webhook/:gateway, POST}`.

| Kiểm tra | Kết quả |
| --- | --- |
| IPN không secret | 401 |
| IPN sai `X-Secret-Key` | 401 |
| IPN còn 404 | Không. Local không còn 404 |
| Webhook SePay không chữ ký | 401. Cơ chế từ chối cũ còn hoạt động. Không có giao dịch thành công |
| `prisma migrate deploy` trong log API | Không có |
| Prisma hoặc Redis error trong log API 5 phút gần nhất | Không có |
| Worker error sau lần deploy API | Không có. Worker vẫn running |
| `spsk_` hoặc tên biến secret trong log API | Không có |

`RUN_MIGRATIONS` và `RUN_SEED` trên container API đều không phải `true`.

## 6. HTTPS và IPN từ Internet

BLOCKED.

Stack local chỉ publish nginx cổng 80. Không có TLS terminator cho stack này. `APP_PUBLIC_URL` đang là HTTP loopback, nên SePay không gọi được return URL hay IPN của máy này.

`https://cardon.vn/` trả 200 và chứng chỉ hợp lệ. `POST https://cardon.vn/api/v1/payments/ipn/esim/sepay` trả 404. Đó là host public khác, không phải API local vừa deploy. Không đổi DNS, firewall hay cấu hình production. Không gán `APP_PUBLIC_URL` local sang `https://cardon.vn` vì việc đó đổi callback bán lẻ mà SePay vẫn không tới được API local.

## 7. Database

Volume `cardon-local-full_cardon_local_full_postgres` và `cardon-local-full_cardon_local_full_redis` còn nguyên. Không reset database. Không chạy migration ngoài kế hoạch. Entrypoint không in dòng migrate hay seed.

## 8. Việc còn BLOCKED

1. Chưa có credential Sandbox. `ESIM_SEPAY_SANDBOX_ENABLED` giữ `false`. Checkout eSIM vẫn fail closed.
2. Chưa có HTTPS public trỏ tới API local này. SePay chưa gọi được IPN.
3. `https://cardon.vn` chưa có route IPN eSIM. Không deploy production trong phase này.
4. Chưa xác nhận SePay Sandbox chấp nhận thứ tự field chính thức, vì không gọi SePay.

Khi có credential Sandbox và một origin HTTPS thực sự trỏ tới API này, mới bật `ESIM_SEPAY_SANDBOX_ENABLED=true` và điền ba giá trị còn lại. Secret `spsk_live_` vẫn bị code từ chối.

Phase 2B.2 dừng tại đây. Không tạo giao dịch Sandbox và không chuyển sang Phase 2C.
