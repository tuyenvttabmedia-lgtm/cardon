# Phase 2B.4B.1 — Cloudflare Authentication & Named Tunnel Preflight

Ngày: 2026-11-06. Đã đăng nhập CLI `cloudflared` của Windows user hiện tại và kiểm tra quyền zone `cardon.vn`. Chưa tạo Named Tunnel, chưa tạo DNS, chưa chạy tunnel, chưa expose API. Không sửa Nginx, Docker Compose, `APP_PUBLIC_URL` hay database.

## Kết luận

**PASS.** Tài khoản vừa ủy quyền có thể xem zone `cardon.vn`, sửa DNS của zone đó, và tạo Named Tunnel. Hostname `ipn-sandbox.cardon.vn` vẫn chưa có bản ghi DNS. Chưa có tunnel nào được tạo trong phase này.

## 1. CLI identity

| Mục | Kết quả |
| --- | --- |
| Executable | `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe` |
| Phiên bản | `cloudflared version 2026.10.7` (built 2026-10-30T09:43 UTC) |
| Thư mục cấu hình | `%USERPROFILE%\.cloudflared` |
| Binary service cũ | Program Files, không phải bản WinGet |

Mọi lệnh trong phase này gọi đúng executable WinGet ở trên.

## 2. Đăng nhập

Login dùng browser flow của `cloudflared tunnel login`. Không nhập token hay mật khẩu vào source. Không lưu credential trong repository.

| Mục | Kết quả |
| --- | --- |
| Trạng thái | thành công, exit code 0 |
| Credential | `%USERPROFILE%\.cloudflared\cert.pem` (282 byte, nhãn ARGO TUNNEL TOKEN) |
| Sao chép | không có `cert.pem` trong Program Files, Program Files (x86), hay repo |
| File khác trong thư mục user | không có `config.yml` và không có JSON credential của tunnel |

Cert chỉ được ủy quyền cho zone `cardon.vn`. Zone khác hiện trong picker không được authorize.

Nội dung cert không ghi vào báo cáo này.

## 3. Quyền zone

Cert gắn đúng zone `cardon.vn`, trạng thái zone `active`.

| Quyền | Kết quả | Cách kiểm |
| --- | --- | --- |
| Xem zone | có | `GET` zone `cardon.vn` trả 200. Permission trên zone gồm `#zone:read` |
| Xem DNS | có | `#dns_records:read`. `GET` bản ghi tên `ipn-sandbox.cardon.vn` trả 200, số bản ghi = 0 |
| Sửa DNS | có | `#dns_records:edit`. POST thiếu trường bắt buộc trả HTTP 400 (mã 9000), không phải 403. Sau đó số bản ghi `ipn-sandbox.cardon.vn` vẫn = 0 |
| Tạo Named Tunnel | có | `cloudflared tunnel list` và `GET` tunnel của account trả 200. POST tạo tunnel với tên rỗng trả HTTP 400 (mã 1006), không phải 403. Số tunnel trước và sau probe vẫn là 1 |

Probe cố ý gửi body không hợp lệ để phân biệt “có quyền nhưng bị từ chối validation” với “không có quyền”. Không có bản ghi DNS mới và không có tunnel mới.

`ipn-sandbox.cardon.vn` vẫn không resolve.

Account đã có sẵn một Named Tunnel tên `paypal-sandbox.cardon.vn`, tạo ngày 2026-11-05. Phase này không tạo, không sửa, không route DNS và không chạy tunnel đó. Tunnel đó không phải hostname IPN eSIM.

## 4. Service cũ

| Mục | Kết quả |
| --- | --- |
| Tên service | `cloudflared` |
| Trạng thái | Running |
| Start mode | Auto |
| Binary | `Program Files\cloudflared.exe`, không phải WinGet |
| Command line | không chứa `ipn-sandbox` và không chứa `cardon` |
| Thay đổi | không dừng, không sửa binary, config, token hay tunnel của service |

Tiến trình `cloudflared` đang chạy là service này. CLI WinGet không còn tiến trình sau khi login kết thúc, nên không chiếm cổng. Nginx local vẫn nghe `0.0.0.0:80` và `[::]:80`. Postgres vẫn chỉ `127.0.0.1:5433`.

## 5. Chưa làm

- Không tạo Named Tunnel cho `ipn-sandbox.cardon.vn`.
- Không tạo hostname hay bản ghi DNS.
- Không chạy tunnel.
- Không expose API.
- Không đổi Nginx, Compose, `APP_PUBLIC_URL`.
- Không dùng credential SePay Live và không tạo giao dịch.
