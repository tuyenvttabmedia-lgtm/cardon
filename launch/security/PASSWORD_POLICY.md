# Password Policy

**Áp dụng:** Customer, Agent portal, Admin panel

---

## 1. Yêu cầu mật khẩu

| Rule | Giá trị |
|------|---------|
| Độ dài tối thiểu | 12 ký tự (admin); 8 ký tự (customer) — khuyến nghị 12 cho tất cả |
| Phức tạp | Chữ hoa + thường + số; ký tự đặc biệt khuyến nghị |
| Dictionary | Không dùng `ChangeMe123!`, tên công ty, `password123` |
| Reuse | Không tái sử dụng 5 mật khẩu gần nhất (policy HR nội bộ) |
| Rotation admin | 90 ngày (SUPER_ADMIN / ADMIN) |

---

## 2. Lưu trữ kỹ thuật

- Hash **bcrypt** cost 12 (`users.password_hash`)
- Không log password plaintext
- Không gửi password qua email trừ temporary one-time link (future)

---

## 3. Authentication hardening (đã có)

| Control | Chi tiết |
|---------|----------|
| Login throttle | 5 attempts / 15 phút |
| JWT access | 15 phút (`JWT_ACCESS_EXPIRES_IN`) |
| Refresh token | 7 ngày, revoke on logout |
| User status | SUSPENDED / BANNED block login |

---

## 4. Admin-specific

- Bắt buộc MFA (TOTP) — **future**; hiện dùng IP allowlist + strong password
- Không lưu password trong `.env` commit
- Password manager (1Password / Bitwarden) bắt buộc cho ops

---

## 5. Agent & customer

- Agent: cùng policy; API dùng key + secret — không dùng password cho API calls
- Customer: reset password qua email (khi feature enable)

---

## 6. Vi phạm

- Share password → suspend account
- Brute force detected → auto block 15 phút + alert

*Phase 6C — Security checklist*
