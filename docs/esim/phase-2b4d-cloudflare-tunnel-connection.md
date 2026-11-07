# Phase 2B.4D — Nối Cloudflare Tunnel vào listener IPN

Ngày: 2026-11-06. Đã nối Named Tunnel `cardon-esim-ipn-sandbox` tới Nginx `http://127.0.0.1:8081`. Không đổi DNS, Nginx, API, tunnel PayPal, hay Windows service `cloudflared` cũ. Chưa bật SePay sandbox và chưa đăng ký IPN trên SePay.

## Kết luận

**PASS.** `https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` đi qua Cloudflare, tunnel, Nginx và tới API. Không có secret hoặc secret sai đều trả HTTP 401 từ API. Path khác trả 404. Method khác POST trả 405.

## 1. Tunnel

| Mục | Giá trị |
| --- | --- |
| Tên | `cardon-esim-ipn-sandbox` |
| ID | `7595a4a5-7a8e-4ea1-b894-b089dd651574` |
| Hostname | `ipn-sandbox.cardon.vn` |
| CNAME | `7595a4a5-7a8e-4ea1-b894-b089dd651574.cfargotunnel.com` |
| Credential | `%USERPROFILE%\.cloudflared\7595a4a5-7a8e-4ea1-b894-b089dd651574.json` |
| Config | `%USERPROFILE%\.cloudflared\config.yml` |
| CLI | WinGet `cloudflared` 2026.10.7 |

CNAME đã đúng từ Phase 2B.4B.2 nên DNS không bị sửa. Credential không ghi vào báo cáo.

## 2. Ingress

```yaml
ingress:
  - hostname: ipn-sandbox.cardon.vn
    service: http://127.0.0.1:8081
  - service: http_status:404
```

`cloudflared tunnel ingress validate` trả OK.

| Request | Rule |
| --- | --- |
| `https://ipn-sandbox.cardon.vn/...` | rule 0, `http://127.0.0.1:8081` |
| `https://cardon.vn/` | rule 1, `http_status:404` |
| `https://paypal-sandbox.cardon.vn/` | rule 1, `http_status:404` |

Không có wildcard hostname. Không có origin cổng 80, cổng 3000, hay dịch vụ khác. Hostname không khớp bị từ chối bằng HTTP 404 tại tunnel.

## 3. Connector

Connector chạy bằng tiến trình user, binary WinGet, lệnh `tunnel run` với đúng tunnel ID. Không cài service mới và không sửa service cũ.

| Mục | Giá trị |
| --- | --- |
| Connector ID | `b9f6a8fb-3ee9-401b-b188-0c6a767ec30a` |
| Bắt đầu | 2026-11-06T12:48:28Z |
| Phiên bản | 2026.10.7, `windows_amd64` |
| Trạng thái | Connected, 4 kết nối QUIC tại `hkg08`, `hkg09`, `hkg11` |
| Log origin | không có lỗi kết nối origin |
| Tiến trình | một `cloudflared.exe` WinGet, tách khỏi service cũ |

Log chỉ ghi đường dẫn credential, không ghi nội dung. Metrics của cloudflared nghe `127.0.0.1:20242`, không publish ra LAN.

## 4. Test A–F

| Test | Request | Kết quả |
| --- | --- | --- |
| A, không secret | `POST https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` | HTTP 401, body API `Invalid signature` |
| A, secret giả | cùng path, `Content-Type: application/json` | HTTP 401 |
| B | `POST https://ipn-sandbox.cardon.vn/api/v1/payments/webhook/sepay` | HTTP 404 từ Nginx |
| C | `GET https://ipn-sandbox.cardon.vn/api/v1/payments/ipn/esim/sepay` | HTTP 405 từ Nginx |
| D | `GET https://ipn-sandbox.cardon.vn/` | HTTP 404, không phải website |
| D | `GET https://cardon.vn/` | HTTP 200, website production |
| E | tunnel PayPal và service cũ | không đổi, xem mục 5 |
| F | connector | Connected, không lỗi origin |

Access log Nginx cho request công khai ghi `secret_present=0` hoặc `1`, không ghi giá trị header. Log API không chứa marker thử nghiệm. Error log Nginx của listener IPN trống.

## 5. Cách ly

| Kiểm tra | Kết quả |
| --- | --- |
| Tunnel PayPal | ID `f4df01d8-0e45-493a-9d13-f3eba510a6c1`, tạo `2026-11-05T09:18:54Z`, connector `68f93a3f-643b-422d-9947-2ab345841f01` vẫn nối |
| CNAME PayPal | vẫn `f4df01d8-0e45-493a-9d13-f3eba510a6c1.cfargotunnel.com` |
| Service `cloudflared` | Running, Auto, binary Program Files, không chứa ID tunnel eSIM |
| API | healthy, created `2026-11-06T10:58:32Z` |
| Worker | healthy, created `2026-11-05T13:59:09Z` |
| PostgreSQL | healthy, created `2026-11-06T11:15:31Z` |
| Redis | healthy, created `2026-10-09T14:26:47Z` |
| Nginx | healthy, created `2026-11-06T12:22:53Z`, không sửa config |
| `ESIM_SEPAY_SANDBOX_ENABLED` | `false` |
| Payment source, DNS website, volume database | không đổi |

## 6. Còn lại

- Connector là tiến trình user, không phải Windows service. Dừng tiến trình đó thì hostname IPN mất connector. Service PayPal không bị dùng cho hostname này.
- Sandbox eSIM vẫn tắt. HTTP 401 là từ chối fail-closed của API, chưa phải xác thực secret sandbox.
- Chưa đăng ký IPN trên SePay và chưa có giao dịch.
