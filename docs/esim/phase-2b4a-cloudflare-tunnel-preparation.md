# Phase 2B.4A — Chuẩn bị Cloudflare Tunnel

Ngày: 2026-11-06. Đã cài `cloudflared` trên host. Chưa đăng nhập CLI mới, chưa tạo Named Tunnel, chưa tạo DNS, chưa chạy tunnel cho `ipn-sandbox.cardon.vn`, chưa expose API. Không sửa Nginx, Compose, `APP_PUBLIC_URL` hay database.

## 1. Môi trường

| Mục | Kết quả |
| --- | --- |
| OS | Windows NT 10.0.26300, AMD64 |
| Docker | Server 29.8.2, OS Linux |
| Network | `cardon-local-full_cardon-local-full` |
| API | container `cardon-local-full-api`, alias `api`, IP `172.18.0.6`, cổng nội bộ 3000, không publish ra host |
| Cách host gọi API | Nginx `127.0.0.1:80`, `location /api/` chuyển sang `api:3000` |
| Postgres | vẫn chỉ `127.0.0.1:5433` |
| DNS `cardon.vn` | nameserver Cloudflare: `finley.ns.cloudflare.com`, `alexia.ns.cloudflare.com` |
| `ipn-sandbox.cardon.vn` | chưa tạo. Phase 2B.3A đã thấy tên này không có bản ghi |

API và web vẫn là hai container. Tunnel trên host không gọi được tên `api` trong Docker. Origin sau này phải là cổng host, tức Nginx local, không phải `api:3000`.

## 2. Cài đặt

Cài bằng winget, scope user, package `Cloudflare.cloudflared`. Không cài dịch vụ Windows mới.

| Mục | Giá trị |
| --- | --- |
| Phiên bản | `cloudflared version 2026.10.7` (built 2026-10-30T09:43 UTC) |
| File | `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe` |
| Cert đăng nhập CLI | không có `%USERPROFILE%\.cloudflared\cert.pem` |

`cloudflared tunnel list` dừng vì chưa có origin certificate. Không có quyền zone nào được xác nhận, vì CLI chưa đăng nhập.

Trên máy đã có một Windows service tên `cloudflared`, start mode Auto, trạng thái Running. Binary nằm trong Program Files, không phải bản WinGet vừa cài. Command line không chứa `ipn-sandbox` hay `cardon`. Service này có token. Token không được in và không được đưa vào source. Service này không bị dừng hay sửa trong phase này.

## 3. Credentials

Chưa lưu tunnel token hay cert vào repo.

Cách giữ an toàn cho bước sau:

- `cloudflared tunnel login` chỉ ghi `cert.pem` trong `%USERPROFILE%\.cloudflared\`.
- `cloudflared tunnel create` ghi file JSON credential cùng thư mục đó.
- Không copy các file này vào repo, Compose, image hay biến build.
- Không dùng token của service Program Files cho IPN eSIM.

## 4. Cấu hình đề xuất cho bước sau

Chưa áp dụng.

Hostname: `ipn-sandbox.cardon.vn`.

Tunnel ingress chỉ nhận đúng path, mọi path khác trả 404 ngay tại edge:

```yaml
ingress:
  - hostname: ipn-sandbox.cardon.vn
    path: /api/v1/payments/ipn/esim/sepay
    service: http://127.0.0.1:80
    originRequest:
      httpHostHeader: ipn-sandbox.cardon.vn
  - service: http_status:404
```

Ingress của `cloudflared` không lọc HTTP method. Nginx local hiện là `default_server` và chuyển cả `/api/`. Vì vậy bước sau phải thêm một vhost riêng, trước khi chạy tunnel:

- `server_name ipn-sandbox.cardon.vn`
- `location = /api/v1/payments/ipn/esim/sepay` chỉ nhận `POST`, method khác trả 405
- mọi path khác trả 404
- `proxy_pass` tới `http://api:3000`, không qua website, admin hay partner

Không mở cổng firewall inbound. Tunnel là kết nối đi ra. Không trỏ origin vào `0.0.0.0:80` theo kiểu publish thêm cổng. Không đổi `APP_PUBLIC_URL` trong bước expose IPN, vì SePay lấy URL IPN từ cấu hình merchant.

## 5. Còn thiếu

1. Người có quyền zone `cardon.vn` chạy `cloudflared tunnel login` bằng CLI WinGet. Quyền tạo Named Tunnel và CNAME chưa kiểm được khi chưa đăng nhập.
2. Chưa tạo tunnel tên riêng cho IPN eSIM.
3. Chưa tạo bản ghi DNS `ipn-sandbox.cardon.vn`.
4. Chưa có vhost Nginx chỉ một path và chỉ `POST`.
5. Chưa có credential SePay Sandbox. Checkout eSIM vẫn tắt.
6. Service `cloudflared` sẵn có trong Program Files không được dùng cho hostname này.

Phase 2B.4A dừng tại đây. Không tạo tunnel và không expose endpoint.
