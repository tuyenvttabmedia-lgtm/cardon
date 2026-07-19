# CardOn — Kiến trúc 3 tầng (Embedded Account)

**Build:** `6033.7 EMBEDDED ACCOUNT ARCHITECTURE`

---

## Sơ đồ tổng thể

```
                    admin.localhost
              (ERP quản trị toàn hệ thống)
                         │
         ┌───────────────┴────────────────┐
         │                                │
    localhost                    partner.localhost
   Website B2C                  Đại lý API (B2B)
         │
         └── /tai-khoan  (nhúng trong site B2C — giữ nguyên menu cũ)
              ├── Thông tin tài khoản
              ├── Lịch sử giao dịch
              ├── Thẻ đã mua
              ├── Nạp cước
              ├── Nạp Data
              ├── Hỗ trợ
              └── Đổi mật khẩu
```

---

## Portal (3 tầng)

| Host | App | Vai trò |
|------|-----|---------|
| `admin.localhost` | `apps/admin` | ERP |
| `localhost` | `apps/web` | B2C + `/tai-khoan` |
| `partner.localhost` | `apps/partner` | B2B API platform |

**Không dùng:** `customer.localhost` — đã gỡ hoàn toàn (không redirect sang `/tai-khoan`).

---

## `/tai-khoan` — không đổi cấu trúc

| URL | Nội dung |
|-----|----------|
| `/tai-khoan` | Thông tin tài khoản |
| `/tai-khoan/lich-su-giao-dich` | Lịch sử giao dịch |
| `/tai-khoan/the-da-mua` | Thẻ đã mua |
| `/tai-khoan/nap-cuoc` | Nạp cước |
| `/tai-khoan/nap-data` | Nạp Data |
| `/tai-khoan/ho-tro` | Hỗ trợ |
| `/tai-khoan/doi-mat-khau` | Đổi mật khẩu |

Mirror tiếng Anh: `/account/*` → redirect về `/tai-khoan/*`.

Chi tiết đơn / xem PIN: `/orders/[id]`.

---

## Đã gỡ (6033.7)

- Host `customer.localhost` (nginx block removed)
- Route group `(customer)/*`, `CustomerShell`
- Top-level `/dashboard`, `/orders`, `/pins`, … → redirect `/` (không ép về tài khoản)

Backend `customer-center` module vẫn tồn tại cho API aggregation; UI dùng lại trang `/tai-khoan` hiện có.
