# CI — Money Flow Smoke Gate (P0.5)

**Ngày:** 2026-07-31

Mục tiêu: mọi thay đổi chạm vào luồng tiền phải được một bộ test tự động chặn
trước khi merge, thay vì phát hiện sau khi đã lên production.

---

## Phạm vi "luồng tiền chính"

Checkout → Payment gateway → Ledger → Provider fulfillment → Đối soát.

| Module | Vì sao nằm trong cổng chặn |
|--------|----------------------------|
| `order` | Snapshot giá, state machine `payment_status`, hết hạn thanh toán, lifecycle `FinancialTransaction` B2C |
| `payment` | Webhook MegaPay/SePay, chống trùng, khớp số tiền, chữ ký, phí |
| `provider` | Mua thẻ/topup, mã hoá PIN, retry sau TIMEOUT, failover, WAITING_ADMIN_RETRY |
| `finance` | Đối soát doanh thu, bảo mật export CSV, phân quyền finance |
| `agent` + `agent-api` | Ledger HOLD/DEBIT/RELEASE, idempotency theo agent, ký request, rate limit |
| `agent-deposit` | Webhook nạp tiền đại lý, sinh mã tham chiếu |
| `operations-center` | Watchdog đơn PAID lệch trạng thái |
| `config/production-env.rules` | Chặn cấu hình production thiếu/sai |

Danh sách được khai báo tường minh trong `jest.money.config.js` để một spec
không thể âm thầm rơi khỏi cổng chặn khi đổi tên hoặc di chuyển file.

---

## Chạy tại máy

```bash
npm run test:money
```

Kết quả kỳ vọng: 30 suite / 262 test, xanh toàn bộ.

---

## GitHub Actions

`.github/workflows/ci.yml` chạy trên mọi push vào `main` và mọi pull request:

| Job | Chặn merge | Nội dung |
|-----|-----------|----------|
| `money-flow` | Có | `prisma generate` → `prisma validate` → `npm run test:money` |
| `build` | Có | `nest build` — bắt lỗi TypeScript của mã production |
| `full-suite` | Có | `npm test` toàn bộ (59 suite) |

Branch protection trên `main` bắt buộc `Money flow smoke tests` và `Build API`.

---

## Nợ đã đóng (P0.5 follow-up)

Specs ngoài luồng tiền (`admin`, `auth`, `product`, `notification`) đã được sửa
cho khớp chữ ký constructor / mock dữ liệu hiện tại. `full-suite` giờ xanh và
chặn merge cùng với hai job kia.
