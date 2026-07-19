# API Key Rotation Process

**Áp dụng:** Agent Partner API (`/api/partner/v1`)

---

## 1. Thành phần credentials

| Field | Storage | Note |
|-------|---------|------|
| `api_key` | Prefix `ak_` | Lookup hash SHA-256 + bcrypt |
| `secret_key` | Prefix `sk_` | Encrypted AES-256-GCM; plain **chỉ hiện 1 lần** |

---

## 2. Khi nào rotate

| Trigger | Mức độ |
|---------|--------|
| Agent báo lộ secret | **Ngay lập tức** |
| Nghi ngờ compromise (log bất thường) | Trong 1 giờ |
| Định kỳ | 12 tháng (best practice) |
| Nhân viên agent nghỉ việc | Trong 24 giờ |

---

## 3. Quy trình rotate (Admin)

### Bước 1 — Disable API tạm

```
POST /api/v1/admin/agents/:id/disable-api
```

- Giao dịch đang PROCESSING: chờ settle hoặc timeout idempotent

### Bước 2 — Regenerate credentials

- Admin → Agents → Approve flow / regenerate (theo UI hiện có sau KYC)
- Hoặc internal script với approval SUPER_ADMIN
- **Lưu secret mới** qua kênh bảo mật (encrypted email / password manager share)

### Bước 3 — Agent cập nhật integration

- Cập nhật `x-api-key` + HMAC secret trên server agent
- Test `GET /balance` trước production traffic

### Bước 4 — Enable API

```
POST /api/v1/admin/agents/:id/enable-api
```

### Bước 5 — Xác nhận

- [ ] Old key không còn request thành công (401)
- [ ] Audit log ghi rotate event
- [ ] Agent xác nhận buy test SUCCESS

---

## 4. Emergency — lộ key hàng loạt

1. Disable API tất cả agents nghi ngờ (hoặc global maintenance flag nếu có)
2. Notify agents qua email template
3. Rotate từng agent theo priority volume
4. Post-mortem 48h

---

## 5. Không rotate

- **ENCRYPTION_KEY** / **JWT_SECRET** trên production without runbook — ảnh hưởng toàn hệ thống
- Provider eSale keys — liên hệ eSale BD, test staging trước

---

## 6. Documentation agent-facing

Partner docs (`partner.cardon.vn/docs`) nên có section "Key rotation" trỏ về support email.

*Phase 6C — Security checklist*
