# SOP — Payment Manual Review

**Áp dụng:** Accountant, Support (có `payments.review`) | **Permission:** `payments.review`

---

## 1. Khi nào cần manual review

| Tình huống | Dấu hiệu |
|------------|-----------|
| Webhook không tới | Khách có sao kê, order WAITING_PAYMENT / EXPIRED |
| Số tiền lệch | `transferAmount` ≠ order total |
| Nội dung CK sai format | Không parse được `PAY-…` |
| Duplicate webhook nghi ngờ | Cùng ref, khác amount |
| Gateway báo SUCCESS, local FAILED | Reconcile mismatch |

Queue: **Admin → Payments → Manual review**

---

## 2. Quy trình xử lý

### Bước 1 — Xác minh thanh toán

1. Lấy `payment_reference` từ nội dung CK (`CARDON PAY-…`) hoặc MegaPay ref
2. Admin → **Payments** → search reference
3. Đối chiếu:
   - Số tiền khớp `payments.amount` (±0 VND)
   - Thời gian trong cửa sổ `expires_at` (hoặc policy ngoại lệ có approval)
   - Gateway / bank txn id chưa dùng cho payment SUCCESS khác

### Bước 2 — Tra webhook logs

- Kiểm tra `webhook_logs`: signature valid?, IP gateway?
- Nếu webhook fail signature → không approve; liên hệ gateway

### Bước 3 — Resolve

```
POST /api/v1/admin/payments/:id/resolve
Body: { "action": "APPROVE" | "REJECT", "note": "..." }
```

| Action | Kết quả |
|--------|---------|
| APPROVE | Mark payment SUCCESS → order PAID → enqueue fulfillment |
| REJECT | Ghi chú, hướng dẫn khách liên hệ ngân hàng / đặt lại |

**Bắt buộc:** ghi `note` rõ ràng (sao kê, mã GD, người duyệt).

### Bước 4 — Sau approve

- Theo dõi fulfillment đến COMPLETED
- Nếu fulfillment fail → chuyển Order Issue SOP

---

## 3. SePay — checklist nhanh

- [ ] `transferType = in`
- [ ] Content chứa `CARDON PAY-XXXXXXXX`
- [ ] Amount khớp chính xác
- [ ] Payment status PENDING hoặc EXPIRED (chưa SUCCESS)

## 4. MegaPay — checklist nhanh

- [ ] Verify qua `queryTransaction(reference)`
- [ ] Callback URL đúng production
- [ ] Merchant ID production

---

## 5. SLA nội bộ

| Mức | Thời gian phản hồi | Resolve |
|-----|-------------------|---------|
| P0 (tiền treo, đơn lớn) | 30 phút | 4 giờ |
| P1 | 2 giờ | 24 giờ |

---

## 6. Audit

Mọi resolve ghi `audit_logs`. Không approve khi thiếu bằng chứng thanh toán.

*Phase 6C — Operation SOP*
