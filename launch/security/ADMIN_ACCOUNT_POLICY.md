# Admin Account Policy

**CardOn.vn — Phase 6C Launch**  
Áp dụng cho mọi tài khoản truy cập Admin Panel (`admin.cardon.vn`).

---

## 1. Nguyên tắc

- **Least privilege:** role thấp nhất đủ làm việc
- **Không dùng chung** tài khoản cá nhân
- **Tách duty:** người duyệt payment ≠ người tạo agent credit (khuyến nghị)

---

## 2. Role matrix

| Role | Mục đích | Ghi chú |
|------|----------|---------|
| SUPPORT | Tra cứu order, retry fulfill, KYC view | Không finance manage |
| MARKETING | CMS banners/pages | Không orders |
| ACCOUNTANT | Payments, reconcile, ledger, invoice | Không suspend agent |
| ADMIN | Vận hành đầy đủ trừ super config | Day-to-day ops |
| SUPER_ADMIN | RBAC, bootstrap, emergency | ≤ 2 người |

---

## 3. Tạo tài khoản

1. Yêu cầu bằng email quản lý + role justification
2. SUPER_ADMIN tạo user → gán role + permissions (RBAC seed)
3. Gửi password **temporary** qua kênh riêng ( không Slack public )
4. User đổi password lần đầu đăng nhập (policy nội bộ)

**Production bootstrap:**

- Không chạy `prisma db seed` trên production
- Dùng script one-time approved (`create-admin-local` pattern) — ghi audit

---

## 4. Thu hồi quyền

| Sự kiện | Hành động |
|---------|-----------|
| Nghỉ việc | Disable user ngay (`status = SUSPENDED`) |
| Đổi vai trò | Update role, review permissions |
| Nghi lộ session | Force logout (invalidate refresh tokens) + đổi password |

---

## 5. Truy cập admin

- URL: `https://admin.cardon.vn` only
- Khuyến nghị: Cloudflare IP allowlist hoặc Zero Trust cho SUPER_ADMIN
- Không bookmark credentials trên máy dùng chung

---

## 6. Audit

- Mọi hành động nhạy cảm ghi `audit_logs`
- Review audit hàng tuần: retry order, payment resolve, agent credit, KYC approve

---

## 7. Incident

Nghi admin account compromise:

1. Suspend user
2. Rotate JWT secret **chỉ khi** có runbook (ảnh hưởng all sessions)
3. Review audit 24h gần nhất
4. Báo cáo management

*Phase 6C — Security checklist*
