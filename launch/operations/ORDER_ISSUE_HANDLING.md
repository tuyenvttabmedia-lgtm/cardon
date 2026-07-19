# SOP — Xử lý sự cố đơn hàng (Order Issue Handling)

**Áp dụng:** Support, Admin | **Hệ thống:** Admin Panel `admin.cardon.vn`

---

## 1. Phân loại nhanh

| Triệu chứng | Trạng thái thường gặp | Mức độ |
|-------------|----------------------|--------|
| Khách đã chuyển khoản, đơn vẫn WAITING_PAYMENT | Payment chưa webhook | P1 |
| PAID + PENDING/PROCESSING quá 5 phút | Fulfillment chậm / queue | P1 |
| PAID + WAITING_ADMIN_RETRY | Provider fail | P1 |
| PAID + COMPLETED, không thấy thẻ | UI / email | P2 |
| EXPIRED nhưng đã trừ tiền | Manual review | P0 |
| Trùng đơn / double charge | Idempotency | P0 |

---

## 2. Quy trình chuẩn

### Bước 1 — Thu thập thông tin

- Mã đơn `ORD-…` hoặc email guest + thời gian đặt
- Ảnh sao kê (SePay) hoặc mã giao dịch MegaPay
- Không yêu cầu khách gửi mật khẩu

### Bước 2 — Tra cứu Admin

1. **Orders** → tìm theo `order_code` / email
2. Ghi nhận: `payment_status`, `fulfillment_status`, `payment_id`
3. Tab **Payments** → `payment_reference`, gateway, webhook logs
4. Tab **Provider transactions** (nếu có) → request_id, status

### Bước 3 — Xử lý theo trạng thái

| payment | fulfillment | Hành động |
|---------|-------------|-----------|
| WAITING_PAYMENT | PENDING | Xem mục Payment Manual Review SOP |
| PAID | PENDING | Chờ worker 2–3 phút; nếu không đổi → check worker heartbeat |
| PAID | PROCESSING > 10 phút | Xem Provider Retry SOP; kiểm tra zombie order |
| PAID | WAITING_ADMIN_RETRY | Admin **Retry fulfillment** (permission `orders.retry`) |
| PAID | COMPLETED | Hướng dẫn khách `/order/{code}` hoặc email lookup |
| EXPIRED | * | Không retry fulfill; nếu có tiền → manual review |

### Bước 4 — Retry fulfillment (Admin)

```
POST /api/v1/admin/orders/:id/retry
```

- Chỉ khi `fulfillment_status = WAITING_ADMIN_RETRY` hoặc theo policy nội bộ
- Ghi audit log lý do retry
- Thông báo khách sau khi COMPLETED

### Bước 5 — Escalation

| Điều kiện | Escalate tới |
|-----------|--------------|
| > 30 phút chưa resolve P1 | Ops / Dev on-call |
| Nghi gian lận | Admin + freeze agent nếu liên quan |
| Lỗi hàng loạt cùng SKU | Provider + tạm INACTIVE variant |

---

## 3. Giao tiếp khách hàng (template)

**Fulfillment chậm:**
> Đơn [ORD-…] đã thanh toán thành công. Hệ thống đang giao mã thẻ, dự kiến trong 5–10 phút. Bạn có thể theo dõi tại [link đơn].

**Hoàn tất:**
> Mã thẻ đã sẵn sàng tại trang đơn hàng. Vui lòng bảo mật mã và không chia sẻ.

---

## 4. Không được làm

- Không gửi mã thẻ qua chat không mã hóa nếu chính sách công ty cấm
- Không sửa trực tiếp DB production
- Không đánh dấu PAID thủ công nếu chưa có bằng chứng thanh toán / quy trình manual review

---

*Phase 6C — Operation SOP*
