# Phase 2B.4B.2 — Named Tunnel riêng cho eSIM Sandbox

Ngày: 2026-11-06. Đã tạo Named Tunnel và bản ghi DNS cho `ipn-sandbox.cardon.vn`. Tunnel chưa chạy và chưa nối tới API. Không sửa Nginx, Docker Compose, `APP_PUBLIC_URL`, tunnel PayPal, hay Windows service `cloudflared` cũ.

## Kết luận

**PASS.** Tunnel `cardon-esim-ipn-sandbox` tồn tại riêng. DNS `ipn-sandbox.cardon.vn` trỏ tới tunnel này, không trỏ tới tunnel PayPal. Ingress đã chuẩn bị sẵn chỉ trả HTTP 404. API chưa được expose.

## 1. Preflight

| Mục | Kết quả |
| --- | --- |
| Executable | `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe` |
| Phiên bản | `cloudflared version 2026.10.7` (built 2026-10-30T09:43 UTC) |
| Credential đăng nhập | `%USERPROFILE%\.cloudflared\cert.pem` (282 byte) |
| Hostname trước khi tạo | `ipn-sandbox.cardon.vn` là NXDOMAIN |
| Tên tunnel mới | chưa tồn tại, không trùng tunnel PayPal |
| Service cũ | Running, Auto, binary Program Files, không phải WinGet |

Tunnel PayPal ghi nhận trước khi tạo tunnel mới:

| Mục | Giá trị |
| --- | --- |
| Tên | `paypal-sandbox.cardon.vn` |
| ID | `f4df01d8-0e45-493a-9d13-f3eba510a6c1` |
| Tạo lúc | 2026-11-05T09:18:54Z |
| Hostname DNS | `paypal-sandbox.cardon.vn` |
| CNAME | `f4df01d8-0e45-493a-9d13-f3eba510a6c1.cfargotunnel.com` |

## 2. Tunnel mới

| Mục | Giá trị |
| --- | --- |
| Tên | `cardon-esim-ipn-sandbox` |
| ID | `7595a4a5-7a8e-4ea1-b894-b089dd651574` |
| Tạo lúc | 2026-11-06T12:09:41Z |
| Credential | `%USERPROFILE%\.cloudflared\7595a4a5-7a8e-4ea1-b894-b089dd651574.json` |
| Cấu hình | `%USERPROFILE%\.cloudflared\config.yml` |

Credential và config chỉ nằm trong profile user. Không có bản sao trong repository hay Program Files. Nội dung credential không ghi vào báo cáo này.

Tunnel mới không có connector đang chạy.

## 3. DNS

Đã thêm một CNAME:

| Hostname | Type | Content | Proxied |
| --- | --- | --- | --- |
| `ipn-sandbox.cardon.vn` | CNAME | `7595a4a5-7a8e-4ea1-b894-b089dd651574.cfargotunnel.com` | có |

Resolver `1.1.1.1` trả địa chỉ Cloudflare `104.21.41.44` và `172.67.159.244` cho hostname này. Nameserver của zone vẫn là `alexia.ns.cloudflare.com` và `finley.ns.cloudflare.com`.

Các bản ghi sau không đổi:

- `cardon.vn`
- `www.cardon.vn`
- `admin.cardon.vn`
- `partner.cardon.vn`
- `paypal-sandbox.cardon.vn` vẫn CNAME tới `f4df01d8-0e45-493a-9d13-f3eba510a6c1.cfargotunnel.com`

`https://cardon.vn` vẫn trả HTTP 200, header `x-cardon-portal: public`.

## 4. Ingress

Config user chỉ có một rule, áp dụng cho mọi request:

```yaml
ingress:
  - service: http_status:404
```

`cloudflared tunnel ingress validate` trả OK. Rule cho `/` và cho `/api/v1/payments/ipn/esim/sepay` đều khớp `http_status:404`.

Không có origin `localhost:80`, Nginx, `/api/`, hay cổng 3000. File này chưa được cài thành Windows service và tunnel chưa được chạy.

## 5. Kiểm tra cách ly

| Kiểm tra | Kết quả |
| --- | --- |
| Tunnel mới trên Cloudflare | có, ID riêng |
| Credential đúng user profile | có |
| Hostname không trỏ tunnel PayPal | CNAME khác tunnel PayPal |
| Tunnel PayPal | cùng ID, cùng thời điểm tạo, connector cũ vẫn có kết nối |
| Service `cloudflared` cũ | vẫn Running, Auto, binary Program Files, command line không chứa ID tunnel mới |
| Tiến trình cloudflared | một tiến trình, thuộc service cũ |
| API container | không publish cổng ra host |
| `POST https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` | HTTP 530 từ Cloudflare, vì connector chưa chạy |
| Firewall inbound | không mở |
| Nginx, Compose, `APP_PUBLIC_URL` | không sửa |

HTTP 530 là lỗi edge của Cloudflare khi chưa có connector. Request không tới API local.

## 6. Chưa làm

- Không chạy tunnel.
- Không nối ingress tới API.
- Không tạo vhost Nginx.
- Không cấu hình SePay.
- Không thực hiện giao dịch.
